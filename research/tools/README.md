# CoreMIDI raw capture proxy (macOS, MIDI 1)

Independent research helper. No device commands, discovery, decoding or generated MIDI. Coordinator-only hardware operation; compilation and `--self-test` do not create a MIDI client. Hardware routing and CubeSuite compatibility remain **unverified**.

## Build and offline check

```sh
xcrun clang -std=c11 -Wall -Wextra -Werror -Wno-deprecated-declarations \
  -framework CoreMIDI -framework CoreFoundation -pthread \
  research/tools/coremidi-proxy.c -o /tmp/chocolate-coremidi-proxy
/tmp/chocolate-coremidi-proxy --self-test
```

The self-test prints a synthetic JSONL header and four packet rows: both directions, distinct timestamps, a 300-byte packet, and an injected relay error. It calls only packet-list construction and logging, never a relay callback or MIDI client creation. The arbitrary byte sequences are not device fixtures or commands.

## Coordinator procedure (not run by worker)

1. Stop other MIDI routing/monitoring and application MIDI activity. Avoid feedback and duplicate direct routes. Back up device state through known working software before experimenting.
2. Run `/tmp/chocolate-coremidi-proxy --list`. JSONL identifies each endpoint by **signed unique ID**, exact display name, direction and offline state. Listing enumerates endpoints, but sends no MIDI. IDs are not list indices; verify the selected physical pair every run. The helper accepts any explicitly selected endpoint, including virtual endpoints; it does not infer physical identity.
3. Start with the exact hardware source and destination IDs:

   ```sh
   /tmp/chocolate-coremidi-proxy --input SOURCE_UID --output DESTINATION_UID --log /private/path/new-capture.jsonl
   ```

   Replace ID placeholders with decimal integers. Log creation is exclusive: existing files are not overwritten. The helper refuses missing, wrong-direction and offline endpoints. Port identities are resolved before creating the virtual pair; there is no automatic selection or reconnect.
4. In CubeSuite select **Chocolate Research From Device** as input and **Chocolate Research To Device** as output, not the physical device. Do not connect either virtual endpoint back into the proxy. If CubeSuite cannot explicitly choose this pair, stop: this helper does not intercept direct hardware access.
5. Perform one known UI operation. Record app/OS/device versions, action, baseline and recovery separately. Confirm both directions in the log. `relayStatus: 0` means CoreMIDI accepted the relay, **not** that hardware processed it or that state is verified.
6. Ctrl-C removes the virtual pair and closes the log. Restore application routing deliberately. Do not publish private raw captures without review.

## Log and limitations

Header: schema 1, hardware unique IDs and Mach timebase numerator/denominator. Packet rows: `sequence` (log serialization order), `direction`, decimal-string `observedTicks` (callback entry) and `timestampTicks` (original CoreMIDI packet time), `relayStatus` and numeric `bytes`. Ticks use `mach_absolute_time`; convert with integer `ticks * timebaseNumer / timebaseDenom` to nanoseconds. Strings preserve 64-bit precision in JavaScript. Sequence is not proof of causality across callback threads; multiple packets in one list share callback observation time.

Relays the original **whole packet list**, preserving bytes, boundaries and timestamps; logging iterates with `MIDIPacketNext`, including packets longer than the nominal 256-byte struct member. SysEx may span packets; do not treat packet boundaries as protocol message boundaries. No filtering, synthetic request, transformation, timeout or retry. Original zero timestamps are preserved; Apple's `MIDIReceived` documentation warns zero does not mean “now” there. Check captured hardware timestamps before making timing claims.

Synchronous, mutex-serialized JSONL writes occur **after** forwarding and may perturb subsequent callback timing under load. This is a research tool, not a real-time-safe production router. Relay/log failures stop the process with nonzero status; capture can be incomplete. There is no disconnect/reconnect recovery or durable `fsync` guarantee. Endpoint lifetime changes require stopping, relisting and restarting. Packet rows reflect observed traffic and relay status, not physical wire delivery.

## API evidence

Checked Apple's current official documentation and the installed macOS SDK `CoreMIDI.framework/Headers/MIDIServices.h`:

- [`MIDIDestinationCreate`](https://developer.apple.com/documentation/coremidi/mididestinationcreate(_:_:_:_:_:)): receive application writes at a virtual destination.
- [`MIDISend`](https://developer.apple.com/documentation/coremidi/midisend(_:_:_:)): forward original packet list to the explicitly selected destination; future timestamps schedule delivery.
- [`MIDIReceived`](https://developer.apple.com/documentation/coremidi/midireceived(_:_:)): distribute hardware input through the virtual source; zero timestamps are not “now”.
- SDK declarations: `MIDIReadProc` high-priority callback thread (lines 371–394); source/destination enumeration (1828–1850); virtual destination/source creation (1972–1977, 2084–2087); unique-ID lookup (2374–2378); architecture-aware `MIDIPacketNext` (2669–2694); bounded `MIDIPacketListAdd` (2714 onward). Line numbers are SDK-specific.

Legacy MIDI 1 APIs are intentionally used for this research capture path; deprecation warnings are suppressed only in the native build command. No dependency on community device protocol definitions.
