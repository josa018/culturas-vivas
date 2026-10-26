import 'aframe';

// Componente oficial de producción para QA & Accesibilidad
AFRAME.registerComponent('control-sensores-qa', {
  init: function () {
    // Escucha el evento nativo cuando el usuario entra al modo inmersivo/VR
    this.el.addEventListener('enter-vr', () => {
      this.evaluarSensoresDispositivo();
    });
  },

  evaluarSensoresDispositivo: function () {
    // 1. Temporizador estricto de seguridad de 1 segundo para el fallback rápido
    const fallbackTimeout = setTimeout(() => {
      this.activarFallbackTactil("Tiempo de espera agotado para el sensor.");
    }, 1000);

    // 2. Validación de la API restrictiva de Apple (iOS 13+ Safari)
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((permissionState: string) => {
          clearTimeout(fallbackTimeout); // Cancelar fallback si el usuario responde a tiempo
          
          if (permissionState === 'granted') {
            console.log("[QA] Giroscopio autorizado con éxito en iOS.");
          } else {
            this.activarFallbackTactil("Permiso denegado por el usuario.");
          }
        })
        .catch((error: any) => {
          clearTimeout(fallbackTimeout);
          console.error("[QA] Error al solicitar sensores:", error);
          this.activarFallbackTactil("Error de hardware/sensores.");
        });

    } else {
      // 3. Validación para Android, Escritorio o Simuladores sin permisos explícitos
      clearTimeout(fallbackTimeout);
      
      // Si está en escritorio (no móvil), activamos el fallback de inmediato
      if (navigator.userAgent.indexOf('Mobile') === -1) {
        this.activarFallbackTactil("Entorno de escritorio detectado sin hardware de movimiento.");
      } else {
        console.log("[QA] Giroscopio activo directamente (Android u otros).");
      }
    }
  },

  // 4. Función de Fallback con Accesibilidad ARIA (WCAG Nivel AA)
  activarFallbackTactil: function (motivo: string) {
    console.warn(`[QA Fallback Activo] Motivo: ${motivo}`);
    
    const statusContenedor = document.getElementById('vr-status-message');
    if (statusContenedor) {
      // Mensaje amigable obligatorio dictado por el requerimiento
      statusContenedor.innerText = "Sensores no disponibles. Activando visualización táctil 2D";
      
      // Atributos semánticos para lectores de pantalla (Accesibilidad Universal)
      statusContenedor.setAttribute('role', 'status');
      statusContenedor.setAttribute('aria-live', 'polite');
      
      // Estilos de visualización en producción
      statusContenedor.style.display = 'block';
      statusContenedor.style.position = 'absolute';
      statusContenedor.style.top = '20px';
      statusContenedor.style.left = '50%';
      statusContenedor.style.transform = 'translateX(-50%)';
      statusContenedor.style.zIndex = '99999';
    }
  }
});
