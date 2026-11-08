export const hardwareCapability = Object.freeze({
  status: 'experimental' as const,
  libraryHardwareQualified: true as const,
  qualificationTransport: 'coordinator-native' as const,
  qualificationIdentity: 'FootCtrlPlus_016' as const,
  qualificationScope: 'full-read-channel-and-bank-storage-write-readback-restore' as const,
  bankStorageRoundtripQualified: true as const,
  bankLayoutSource: 'coordinator-owned-layout' as const,
  webMidiHardwareQualified: false as const,
  coordinatorIndependentReadWriteObserved: true as const,
  firmware: 'unsupported' as const,
  factoryReset: 'unsupported' as const,
  arbitraryFieldLayouts: 'unsupported' as const,
});
