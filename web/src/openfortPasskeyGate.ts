type Listener = (ready: boolean) => void

const listeners = new Set<Listener>()
let pending: { resolve: () => void; reject: (err: Error) => void } | null = null

function notify(ready: boolean) {
  for (const listener of listeners) listener(ready)
}

export function subscribePasskeyGate(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function confirmPasskeyGate() {
  if (!pending) return
  pending.resolve()
  pending = null
  notify(false)
}

export function cancelPasskeyGate(reason = 'Passkey approval cancelled') {
  pending?.reject(new Error(reason))
  pending = null
  notify(false)
}

export function awaitPasskeyGate() {
  notify(true)
  return new Promise<void>((resolve, reject) => {
    pending?.reject(new Error('Superseded by a newer passkey request'))
    pending = { resolve, reject }
  })
}

declare global {
  // Openfort's sendCallSync waits here so WebAuthn gets a fresh user click.
  var __lanternAwaitPasskey: (() => Promise<void>) | undefined
}

globalThis.__lanternAwaitPasskey = awaitPasskeyGate
