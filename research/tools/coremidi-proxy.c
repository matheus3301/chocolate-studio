/* Independent MIDI 1 research relay. No device protocol or generated traffic. */
#include <CoreMIDI/CoreMIDI.h>
#include <CoreFoundation/CoreFoundation.h>
#include <errno.h>
#include <inttypes.h>
#include <limits.h>
#include <mach/mach_time.h>
#include <pthread.h>
#include <signal.h>
#include <stdbool.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

_Static_assert(ATOMIC_BOOL_LOCK_FREE == 2, "Signal handler requires lock-free atomics");
static atomic_bool stopping;
static atomic_bool relay_failed;
static pthread_mutex_t log_lock = PTHREAD_MUTEX_INITIALIZER;
static FILE *log_file;
static MIDIPortRef output_port;
static MIDIEndpointRef hardware_output, virtual_source;
static uint64_t sequence;

static void stop_signal(int sig) { (void)sig; stopping = 1; }
static bool check(OSStatus status, const char *operation) {
    if (status == noErr) return true;
    fprintf(stderr, "%s failed: %d\n", operation, (int)status);
    return false;
}

/* Serialize complete lines from both CoreMIDI callback threads. No byte decoding. */
static void log_packets(const MIDIPacketList *list, const char *direction,
                        OSStatus relay_status, uint64_t observed) {
    pthread_mutex_lock(&log_lock);
    const MIDIPacket *packet = &list->packet[0];
    for (UInt32 i = 0; i < list->numPackets; ++i) {
        fprintf(log_file, "{\"type\":\"packet\",\"sequence\":%" PRIu64
                ",\"direction\":\"%s\",\"observedTicks\":\"%" PRIu64
                "\",\"timestampTicks\":\"%" PRIu64 "\",\"relayStatus\":%d,\"bytes\":[",
                sequence++, direction, observed, (uint64_t)packet->timeStamp, (int)relay_status);
        for (UInt16 j = 0; j < packet->length; ++j)
            fprintf(log_file, "%s%u", j ? "," : "", packet->data[j]);
        fputs("]}\n", log_file);
        packet = MIDIPacketNext(packet);
    }
    if (fflush(log_file) != 0 || ferror(log_file)) {
        fputs("Capture log write failed; stopping relay.\n", stderr);
        relay_failed = true;
        stopping = 1;
    }
    pthread_mutex_unlock(&log_lock);
}

static void from_hardware(const MIDIPacketList *list, void *ref, void *connection) {
    (void)ref; (void)connection;
    if (stopping) return;
    uint64_t observed = mach_absolute_time();
    OSStatus status = MIDIReceived(virtual_source, list);
    log_packets(list, "hardware-to-application", status, observed);
    if (status != noErr) { check(status, "MIDIReceived"); relay_failed = true; stopping = 1; }
}
static void from_application(const MIDIPacketList *list, void *ref, void *connection) {
    (void)ref; (void)connection;
    if (stopping) return;
    uint64_t observed = mach_absolute_time();
    OSStatus status = MIDISend(output_port, hardware_output, list);
    log_packets(list, "application-to-hardware", status, observed);
    if (status != noErr) { check(status, "MIDISend"); relay_failed = true; stopping = 1; }
}

static void print_json_string(const char *text) {
    putchar('"');
    for (const unsigned char *p = (const unsigned char *)text; *p; ++p) {
        if (*p == '"' || *p == '\\') printf("\\%c", *p);
        else if (*p < 32) printf("\\u%04x", *p);
        else putchar(*p);
    }
    putchar('"');
}
static void list_ports(bool sources) {
    ItemCount count = sources ? MIDIGetNumberOfSources() : MIDIGetNumberOfDestinations();
    for (ItemCount i = 0; i < count; ++i) {
        MIDIEndpointRef endpoint = sources ? MIDIGetSource(i) : MIDIGetDestination(i);
        SInt32 uid = 0, offline = 0;
        CFStringRef name = NULL;
        char text[2048] = "(name unavailable)";
        if (!check(MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyUniqueID, &uid), "Get unique ID")) continue;
        MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyOffline, &offline);
        if (MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &name) == noErr && name) {
            if (!CFStringGetCString(name, text, sizeof text, kCFStringEncodingUTF8))
                snprintf(text, sizeof text, "(name too long)");
            CFRelease(name);
        }
        printf("{\"type\":\"port\",\"direction\":\"%s\",\"uniqueId\":%d,\"offline\":%s,\"name\":",
               sources ? "source" : "destination", (int)uid, offline ? "true" : "false");
        print_json_string(text);
        puts("}");
    }
}
static bool parse_uid(const char *text, SInt32 *uid) {
    char *end;
    errno = 0;
    long value = strtol(text, &end, 10);
    if (errno || !*text || *end || value < INT32_MIN || value > INT32_MAX || value == 0) return false;
    *uid = (SInt32)value;
    return true;
}
static MIDIEndpointRef find_endpoint(SInt32 uid, bool source) {
    MIDIObjectRef object = 0;
    MIDIObjectType type = kMIDIObjectType_Other;
    if (!check(MIDIObjectFindByUniqueID(uid, &object, &type), "Find selected unique ID")) return 0;
    if (type != (source ? kMIDIObjectType_Source : kMIDIObjectType_Destination)) {
        fputs("Selected unique ID has wrong endpoint direction.\n", stderr);
        return 0;
    }
    SInt32 offline = 0;
    MIDIObjectGetIntegerProperty(object, kMIDIPropertyOffline, &offline);
    if (offline) { fputs("Selected endpoint is offline.\n", stderr); return 0; }
    return (MIDIEndpointRef)object;
}
static void write_header(SInt32 input, SInt32 output) {
    mach_timebase_info_data_t timebase;
    mach_timebase_info(&timebase);
    fprintf(log_file, "{\"type\":\"capture\",\"schema\":1,\"clock\":\"mach_absolute_time\","
            "\"timebaseNumer\":%u,\"timebaseDenom\":%u,\"sourceUniqueId\":%d,\"destinationUniqueId\":%d}\n",
            timebase.numer, timebase.denom, (int)input, (int)output);
    fflush(log_file);
}

/* Synthetic logger exercise only: does not create a MIDI client or send anything. */
static int self_test(void) {
    union { max_align_t align; unsigned char data[2048]; } storage;
    MIDIPacketList *list = (MIDIPacketList *)storage.data;
    MIDIPacket *packet = MIDIPacketListInit(list);
    const Byte first[] = {0, 127, 128, 255};
    Byte long_packet[300];
    for (size_t i = 0; i < sizeof long_packet; ++i) long_packet[i] = (Byte)i;
    packet = MIDIPacketListAdd(list, sizeof storage, packet, 123, sizeof first, first);
    if (!packet) return 1;
    packet = MIDIPacketListAdd(list, sizeof storage, packet, 456, sizeof long_packet, long_packet);
    if (!packet) return 1;
    log_file = stdout;
    write_header(0, 0);
    log_packets(list, "hardware-to-application", 0, 789);
    log_packets(list, "application-to-hardware", -1, 790);
    return ferror(stdout) ? 1 : 0;
}

int main(int argc, char **argv) {
    if (argc == 2 && !strcmp(argv[1], "--self-test")) return self_test();
    if (argc == 2 && !strcmp(argv[1], "--list")) {
        list_ports(true); list_ports(false); return 0;
    }
    SInt32 input_uid, output_uid;
    if (argc != 7 || strcmp(argv[1], "--input") || strcmp(argv[3], "--output") ||
        strcmp(argv[5], "--log") || !parse_uid(argv[2], &input_uid) || !parse_uid(argv[4], &output_uid)) {
        fprintf(stderr, "Usage: %s --list | --self-test | --input SOURCE_UID --output DESTINATION_UID --log NEW_FILE.jsonl\n", argv[0]);
        return 2;
    }
    MIDIEndpointRef input = find_endpoint(input_uid, true);
    hardware_output = find_endpoint(output_uid, false);
    if (!input || !hardware_output) return 1;
    log_file = fopen(argv[6], "wx");
    if (!log_file) { perror("Create exclusive capture log"); return 1; }
    write_header(input_uid, output_uid);
    MIDIClientRef client = 0;
    MIDIPortRef input_port = 0;
    MIDIEndpointRef virtual_destination = 0;
    int result = 1;
    if (!check(MIDIClientCreate(CFSTR("Chocolate Research Relay"), NULL, NULL, &client), "MIDIClientCreate")) goto cleanup;
    if (!check(MIDIOutputPortCreate(client, CFSTR("Relay hardware output"), &output_port), "MIDIOutputPortCreate")) goto cleanup;
    if (!check(MIDISourceCreate(client, CFSTR("Chocolate Research From Device"), &virtual_source), "MIDISourceCreate")) goto cleanup;
    if (!check(MIDIInputPortCreate(client, CFSTR("Relay hardware input"), from_hardware, NULL, &input_port), "MIDIInputPortCreate")) goto cleanup;
    if (!check(MIDIPortConnectSource(input_port, input, NULL), "MIDIPortConnectSource")) goto cleanup;
    if (!check(MIDIDestinationCreate(client, CFSTR("Chocolate Research To Device"), from_application, NULL, &virtual_destination), "MIDIDestinationCreate")) goto cleanup;
    signal(SIGINT, stop_signal);
    signal(SIGTERM, stop_signal);
    fputs("Relay ready. Select ONLY Chocolate Research From Device / To Device in the application. Ctrl-C stops.\n", stderr);
    while (!stopping) CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.1, false);
    result = relay_failed || ferror(log_file) ? 1 : 0;
cleanup:
    stopping = 1;
    if (client) MIDIClientDispose(client);
    if (fclose(log_file) != 0) result = 1;
    return result;
}
