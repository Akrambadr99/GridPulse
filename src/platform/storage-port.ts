/** Read capability for projections, validation, and snapshot review. */
export interface StorageReader {
  getItem: (key: string) => string | null
}

/** Write capability; readers do not need access to mutation methods. */
export interface StorageWriter {
  setItem: (key: string, value: string) => void
}

/** Browser and in-memory stores satisfy this structural contract. */
export interface StoragePort extends StorageReader, StorageWriter {}
