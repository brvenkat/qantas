import { useCallback, useEffect, useRef, useState } from 'react'
import { directory, DirectoryError } from '../directory'

export function useDirectory() {
  const [snapshot, setSnapshot] = useState(directory.cached)
  const [pending, setPending] = useState(true)
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [error, setError] = useState<DirectoryError | null>(null)
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++generation.current
    setPending(true)
    setError(null)
    try {
      const next = await directory.load()
      if (request === generation.current) setSnapshot(next)
    } catch (cause) {
      if (request === generation.current) {
        setSnapshot(directory.cached())
        setError(cause instanceof DirectoryError ? cause : new DirectoryError('The airport directory could not be loaded.', Date.now() + 5000))
      }
    } finally {
      if (request === generation.current) setPending(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const reconnect = () => {
      setOffline(false)
      void refresh()
    }
    const disconnect = () => setOffline(true)
    window.addEventListener('online', reconnect)
    window.addEventListener('offline', disconnect)
    return () => {
      generation.current++
      window.removeEventListener('online', reconnect)
      window.removeEventListener('offline', disconnect)
    }
  }, [refresh])

  return { snapshot, pending, error, offline, refresh }
}
