/**
 * Tipi minimi della File System Access API che mancano in lib.dom (TypeScript 6):
 * i permessi sugli handle e il selettore di cartelle. Il resto (kind, name, values(),
 * getFile()) è già in lib.dom e queste interfacce vi si fondono.
 * File globale: nessun import/export, altrimenti le dichiarazioni non si fonderebbero.
 */

interface FsaPermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission(descriptor?: FsaPermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FsaPermissionDescriptor): Promise<PermissionState>
}

interface FsaDirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
}

interface Window {
  showDirectoryPicker(options?: FsaDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
}
