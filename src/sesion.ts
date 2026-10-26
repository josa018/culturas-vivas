export async function iniciarSesion(): Promise<string | null> {
  try {
    let id = sessionStorage.getItem('id_sesion');
    if (!id) {
      const r = await fetch('/api/session/start', { method: 'POST' });
      id = (await r.json()).id_sesion as string;
      sessionStorage.setItem('id_sesion', id);
    }
    setInterval(() => {
      fetch('/api/session/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_sesion: id }),
      });
    }, 30000);
    return id;
  } catch {
    console.warn('No se pudo iniciar la sesión');
    return null;
  }
}