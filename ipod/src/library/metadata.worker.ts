/**
 * Worker di lettura dei tag: tiene music-metadata fuori dal thread principale, così ghiera e
 * schermo restano fluidi durante un'importazione. Non lancia mai: ogni esito è un messaggio,
 * e la copertina viaggia come buffer trasferito (nessuna copia).
 */
import { parseBlob } from 'music-metadata'
import { pickPicture, toParsedTags, type ParsedPicture, type ParsedTags } from './mapping'

export interface MetadataRequest {
  id: number
  file: File
}

export type MetadataReply =
  | { id: number; ok: true; common: ParsedTags; picture?: ParsedPicture }
  | { id: number; ok: false; error: string }

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name
  return typeof e === 'string' ? e : 'errore sconosciuto'
}

function isRequest(x: unknown): x is MetadataRequest {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Partial<MetadataRequest>
  return typeof r.id === 'number' && r.file instanceof Blob
}

function send(reply: MetadataReply, transfer: Transferable[]): void {
  try {
    postMessage(reply, { transfer })
  } catch {
    // Buffer non trasferibile (già staccato?): si rimanda con una copia; se fallisce anche così non c'è altro da fare.
    try {
      postMessage(reply)
    } catch {
      // niente
    }
  }
}

async function handle(req: MetadataRequest): Promise<void> {
  const transfer: Transferable[] = []
  let reply: MetadataReply
  try {
    // skipPostHeaders: non si scandisce il file in cerca di tag in coda; duration: false evita di
    // leggere tutto il file per gli mp3 senza header Xing (la durata la dà il lettore al primo ascolto).
    const meta = await parseBlob(req.file, { skipPostHeaders: true, duration: false })
    const picture = pickPicture(meta)
    reply = { id: req.id, ok: true, common: toParsedTags(meta) }
    if (picture) {
      reply.picture = picture
      transfer.push(picture.data)
    }
  } catch (e) {
    reply = { id: req.id, ok: false, error: errorMessage(e) }
  }
  send(reply, transfer)
}

self.addEventListener('message', (ev: MessageEvent) => {
  const data: unknown = ev.data
  if (!isRequest(data)) {
    const id = typeof data === 'object' && data !== null && typeof (data as { id?: unknown }).id === 'number' ? (data as { id: number }).id : -1
    send({ id, ok: false, error: 'richiesta non valida' }, [])
    return
  }
  void handle(data)
})
