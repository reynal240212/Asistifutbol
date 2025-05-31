// js/faceplusplus.js

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnCapturar = document.getElementById('btn-capturar');
const mensaje = document.getElementById('face-message');
const listaAsistencias = document.getElementById('lista-asistencias');

// 🔐 Se espera que el cliente Supabase esté inicializado en index.html
// y disponible globalmente como 'supabase' o 'window.supabase'.
// NO lo redeclares ni lo reinicialices aquí.
// ELIMINA LAS SIGUIENTES LÍNEAS:
// const supabaseUrl = 'https://wdnlqfiwuocmmcdowjyw.supabase.co';
// const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkbmxxZml3dW9jbW1jZG93anl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjY1ODAsImV4cCI6MjA2NDEwMjU4MH0.4SCS_NRDIYLQJ1XouqW111BxkMOlwMWOjje9gFTgW_Q';
// const supabase = supabase.createClient(supabaseUrl, supabaseKey);


// ⚠️ Las claves de Face++ se gestionarán a través del Edge Function de Supabase
// const API_KEY = '-_MnSfFBpj_afaQSVeATkyly5rMS35b9'; // REMOVE
// const API_SECRET = 'c07uRGg-jNewVeRrGnTDq3Y_33sXCZni'; // REMOVE

// Iniciar cámara con manejo de errores
async function iniciarCamara() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (err) {
    mostrarMensaje('Error al acceder a la cámara: ' + err.message, 'danger');
  }
}

iniciarCamara();

// Capturar imagen y procesar
btnCapturar.addEventListener('click', () => {
  if (video.readyState !== 4) {
    mostrarMensaje('La cámara aún no está lista. Por favor, espera...', 'warning');
    return;
  }
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imagenBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
  detectarRostro(imagenBase64);
});

// Detectar rostro con el Edge Function de Supabase
async function detectarRostro(imagenBase64) {
  mostrarMensaje('Procesando imagen...', 'info');

  // Ensure supabase client is available
  if (!window.supabase || !window.supabase.supabaseUrl || !window.supabase.supabaseKey) {
    mostrarMensaje('Error: Cliente Supabase no está configurado correctamente.', 'danger');
    console.error('Supabase client (window.supabase) or its properties are not available.');
    return;
  }

  // Construct the Edge Function URL
  // The Supabase URL from window.supabase.supabaseUrl is like "https://<project-ref>.supabase.co"
  // We need to append "/functions/v1/faceplusplus-proxy"
  const edgeFunctionUrl = `${window.supabase.supabaseUrl}/functions/v1/faceplusplus-proxy`;

  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.supabase.supabaseKey}`, // Use the anon key
        'apikey': window.supabase.supabaseKey // Supabase also often expects the anon key as 'apikey'
      },
      body: JSON.stringify({ image_base64: imagenBase64 })
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle errors from the Edge Function or network issues
      console.error('Error from Face++ proxy or network:', data);
      const errorMessage = data.error || `Error al procesar: ${response.status} ${response.statusText}`;
      mostrarMensaje(errorMessage, 'danger');
      return;
    }

    if (data.faces && data.faces.length > 0) {
      const atributos = data.faces[0].attributes;
      const genero = atributos.gender.value;
      const edad = atributos.age.value;
      const hora = new Date().toLocaleTimeString();

      // This part of the logic can remain similar,
      // as the Edge Function should forward the relevant Face++ response structure.
      // However, the next step in the plan is to save to Supabase from the Edge Function itself.
      // So, the frontend message might eventually change to reflect that.
      // For now, we assume the Edge Function *only* proxies to Face++.
      // The plan step 3 will modify the Edge function to also save to DB.

      mostrarMensaje(`Rostro detectado: ${genero}, ${edad} años (procesado por backend)`, 'success');

      // The plan is to save attendance from the Edge Function (step 3).
      // So, the frontend's role in adding to the list might change or be triggered by a more specific success message.
      // For now, let's keep the existing behavior of adding to the visual list directly.
      // We might need to call cargarAsistencias() if the saving logic is confirmed in the Edge Function later.
      agregarAsistencia(`Jugador detectado (Backend)`, `Presente - ${hora}`);

      // The old code for saving to Supabase from client-side is commented out, which is good.
      // await guardarAsistenciaEnSupabase('Jugador detectado', true); // Ejemplo
    } else if (data.error_message) {
      // Handle specific errors returned by Face++ via the proxy
      console.error('Error from Face++ API:', data.error_message);
      mostrarMensaje(`Error de Face++: ${data.error_message}`, 'warning');
    }
    else {
      mostrarMensaje('No se detectó ningún rostro. Intenta de nuevo. (procesado por backend)', 'warning');
    }
  } catch (error) {
    console.error('Error al llamar al Edge Function:', error);
    mostrarMensaje(`Error de conexión con el backend: ${error.message}`, 'danger');
  }
}

// Mostrar mensajes con clase bootstrap
function mostrarMensaje(texto, tipo) {
  mensaje.className = `alert alert-${tipo} mt-3`;
  mensaje.textContent = texto;
  mensaje.classList.remove('d-none');
}

// Agregar asistencia a la lista visual
function agregarAsistencia(nombre, estado) {
  const li = document.createElement('li');
  li.className = 'list-group-item d-flex justify-content-between align-items-center';
  li.innerHTML = `
    ${nombre}
    <span class="badge bg-success rounded-pill">${estado}</span>
  `;
  listaAsistencias.appendChild(li);
}

// Cargar asistencias desde Supabase y mostrar en lista
async function cargarAsistencias() {
  // Verifica si el cliente supabase está disponible
  if (!window.supabase) {
      mostrarMensaje('Cliente Supabase no inicializado.', 'danger');
      console.error('El cliente Supabase (window.supabase) no está disponible.');
      return;
  }
  try {
    // 'supabase' aquí se refiere a window.supabase, que es la instancia del cliente
    const { data, error } = await supabase // Esto usará window.supabase
      .from('asistencias')
      .select(`
        id,
        fecha,
        tipo_evento,
        asistio,
        jugadores (nombre)
      `)
      .order('fecha', { ascending: false });

    if (error) {
      console.error('Error al cargar asistencias:', error.message);
      mostrarMensaje('Error al cargar asistencias.', 'danger');
      return;
    }

    listaAsistencias.innerHTML = ''; // Limpiar lista anterior

    data.forEach(asistencia => {
      const nombre = asistencia.jugadores?.nombre || 'Desconocido';
      const estado = asistencia.asistio ? 'Presente' : 'Ausente';
      const clase = asistencia.asistio ? 'bg-success' : 'bg-danger';
      const fecha = new Date(asistencia.fecha).toLocaleDateString('es-CO'); // Formato de fecha para Colombia

      const item = document.createElement('li');
      item.className = 'list-group-item d-flex justify-content-between align-items-center';
      item.innerHTML = `
        ${nombre} - ${asistencia.tipo_evento || 'Evento'}
        <span class="badge ${clase} rounded-pill">${estado} - ${fecha}</span>
      `;

      listaAsistencias.appendChild(item);
    });
  } catch (error) {
    console.error('Error inesperado al cargar asistencias:', error);
    mostrarMensaje('Error inesperado al cargar asistencias.', 'danger');
  }
}

document.addEventListener('DOMContentLoaded', cargarAsistencias);

// Opcional: Función de ejemplo si quieres guardar en Supabase después de la detección
/*
async function guardarAsistenciaEnSupabase(nombreJugador, asistioStatus) {
  if (!window.supabase) {
    console.error('Cliente Supabase no disponible para guardar.');
    return;
  }
  try {
    const { data, error } = await supabase // Esto usará window.supabase
      .from('asistencias') // O tu tabla relevante
      .insert([
        { 
          // Ajusta las columnas según la estructura de tu tabla 'asistencias'
          // jugador_nombre: nombreJugador, // si tienes una columna directa para el nombre
          // jugador_id: algun_id, // si enlazas a una tabla 'jugadores'
          fecha: new Date().toISOString(),
          asistio: asistioStatus,
          tipo_evento: 'Reconocimiento Facial'
        }
      ]);

    if (error) {
      console.error('Error guardando asistencia en Supabase:', error);
      mostrarMensaje('Error al guardar asistencia en BD.', 'danger');
    } else {
      console.log('Asistencia guardada en Supabase:', data);
      mostrarMensaje('Asistencia registrada en BD.', 'success');
      cargarAsistencias(); // Refrescar la lista
    }
  } catch (err) {
    console.error('Error inesperado guardando en Supabase:', err);
    mostrarMensaje('Error inesperado al guardar en BD.', 'danger');
  }
}
*/