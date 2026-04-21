import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

const POLL_INTERVAL_MS = 90 * 1000; // 90 segundos

export function useVersionCheck() {
  const baselineRef = useRef(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const fetchVersion = useCallback(async () => {
    try {
      const res = await api.get('/version');
      return res.data?.version ?? null;
    } catch {
      return null; // falha silenciosa — blip de rede não dispara falso positivo
    }
  }, []);

  // Captura baseline na montagem
  useEffect(() => {
    fetchVersion().then(v => { if (v) baselineRef.current = v; });
  }, [fetchVersion]);

  // Loop de polling
  useEffect(() => {
    const interval = setInterval(async () => {
      const current = await fetchVersion();
      if (!current || !baselineRef.current) return;
      if (current !== baselineRef.current) {
        setUpdateAvailable(true);
        clearInterval(interval); // para de fazer polling após detectar
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchVersion]);

  return { updateAvailable };
}
