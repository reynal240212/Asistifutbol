const supabase = window.supabase; // Asegura el acceso al cliente global

// Carga la asistencia desde Supabase
async function cargarAsistencias() {
  if (!supabase) {
    console.error('Cliente Supabase no disponible.');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('asistencias')
      .select(`
        jugador_id,
        fecha,
        tipo_evento,
        asistio,
        fuente,
        foto_tomada_url
      `);

    if (error) throw error;

    const asistenciaLista = document.getElementById('asistencia-lista');
    asistenciaLista.innerHTML = '';
    data.forEach(asistencia => {
      const li = document.createElement('li');
      li.textContent = `Jugador ID: ${asistencia.jugador_id}, Fecha: ${asistencia.fecha}, Evento: ${asistencia.tipo_evento}, Asistió: ${asistencia.asistio ? 'Sí' : 'No'}, Fuente: ${asistencia.fuente}`;
      asistenciaLista.appendChild(li);
    });

  } catch (error) {
    console.error('Error al cargar asistencias:', error);
  }
}

// Guarda la asistencia en Supabase
async function guardarAsistenciaEnSupabase(jugador_id, asistioStatus, fotoUrl) {
  if (!supabase) {
    console.error('Cliente Supabase no disponible para guardar.');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('asistencias')
      .insert([{
        jugador_id,
        fecha: new Date().toISOString(),
        asistio: asistioStatus,
        tipo_evento: 'Reconocimiento Facial',
        fuente: 'reconocimiento facial',
        foto_tomada_url: fotoUrl
      }]);

    if (error) {
      console.error('Error guardando asistencia en Supabase:', error);
      mostrarMensaje('Error al guardar asistencia en BD.', 'danger');
    } else {
      console.log('Asistencia guardada en Supabase:', data);
      mostrarMensaje('Asistencia registrada en BD.', 'success');
      cargarAsistencias(); // Refrescar
    }
  } catch (err) {
    console.error('Error inesperado guardando en Supabase:', err);
    mostrarMensaje('Error inesperado al guardar en BD.', 'danger');
  }
}

// Convierte canvas a Blob y sube imagen a Supabase Storage
async function subirFotoYRegistrar(jugador_id, canvas) {
  canvas.toBlob(async blob => {
    const filePath = `jugador_${jugador_id}_${Date.now()}.png`;
    const { data, error } = await supabase.storage
      .from('fotos')
      .upload(filePath, blob, { contentType: 'image/png' });

    if (error) {
      console.error('Error subiendo imagen:', error);
      mostrarMensaje('Error al subir la imagen.', 'danger');
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('fotos')
      .getPublicUrl(filePath);

    const urlPublica = publicUrlData.publicUrl;
    guardarAsistenciaEnSupabase(jugador_id, true, urlPublica);
  }, 'image/png');
}

// Muestra mensajes en pantalla
function mostrarMensaje(mensaje, tipo = 'info') {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${tipo}`;
  alertDiv.textContent = mensaje;
  document.body.appendChild(alertDiv);

  setTimeout(() => {
    alertDiv.remove();
  }, 3000);
}

// Detecta rostro usando la API de Face++
async function detectarRostroConFacePP(canvas) {
  const apiKey = 'TU_FACEPP_API_KEY';
  const apiSecret = 'TU_FACEPP_API_SECRET';
  const url = 'https://api-us.faceplusplus.com/facepp/v3/detect';

  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      const formData = new FormData();
      formData.append('api_key', apiKey);
      formData.append('api_secret', apiSecret);
      formData.append('image_file', blob);
      formData.append('return_attributes', 'gender,age');

      try {
        const response = await fetch(url, { method: 'POST', body: formData });
        const result = await response.json();

        if (result.faces && result.faces.length > 0) {
          resolve(true); // Rostro detectado
        } else {
          resolve(false); // No se detectó rostro
        }
      } catch (error) {
        reject(error);
      }
    }, 'image/jpeg');
  });
}

// Procesa y guarda asistencia con validación facial
async function procesarYGuardarAsistencia(jugador_id, canvas) {
  try {
    const rostroDetectado = await detectarRostroConFacePP(canvas);
    if (rostroDetectado) {
      console.log('Rostro detectado');
      await subirFotoYRegistrar(jugador_id, canvas);
    } else {
      mostrarMensaje('No se detectó ningún rostro en la imagen.', 'warning');
    }
  } catch (error) {
    console.error('Error en el proceso de reconocimiento:', error);
    mostrarMensaje('Error en el reconocimiento facial.', 'danger');
  }
}

// Inicializar cuando cargue la página
document.addEventListener('DOMContentLoaded', () => {
  cargarAsistencias();
});
