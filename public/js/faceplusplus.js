// js/faceplusplus.js

// Referencias a los elementos del DOM
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnCapturar = document.getElementById('btn-capturar');
const mensaje = document.getElementById('face-message');
const listaAsistencias = document.getElementById('lista-asistencias');

// 🔐 IMPORTANTE: Se espera que el cliente Supabase ya esté inicializado
// en index.html y disponible globalmente como 'window.supabase'.
// NO redeclares ni reinicialices el cliente Supabase aquí.

// ⚠️ Reemplaza estas claves por tus propias credenciales de Face++
// Asegúrate de que estas claves sean correctas para tu proyecto Face++.
const API_KEY = '-_MnSfFBpj_afaQSVeATkyly5rMS35b9';
const API_SECRET = 'c07uRGg-jNewVeRrGnTDq3Y_33sXCZni';
const FACESET_TOKEN = 'dibafbc_faces';

/**
 * @function iniciarCamara
 * @description Inicia el stream de video de la cámara del usuario en el elemento <video>.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la cámara se ha iniciado o se rechaza en caso de error.
 */
async function iniciarCamara() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
    } catch (err) {
        // Muestra un mensaje de error al usuario si no se puede acceder a la cámara.
        mostrarMensaje('Error al acceder a la cámara: ' + err.message, 'danger');
        console.error('Error al iniciar la cámara:', err);
    }
}

// Llama a la función para iniciar la cámara tan pronto como el script se carga.
iniciarCamara();

/**
 * @event click
 * @description Manejador de eventos para el botón 'Capturar Rostro'.
 * Captura una imagen del video, la convierte a Base64 y la envía para detección facial.
 */
btnCapturar.addEventListener('click', () => {
    // Verifica si el video está listo para ser capturado.
    if (video.readyState !== 4) {
        mostrarMensaje('La cámara aún no está lista. Por favor, espera...', 'warning');
        return;
    }

    // Cambiar estado del botón a "Cargando"
    btnCapturar.disabled = true;
    btnCapturar.innerHTML = '<i class="fas fa-spinner spinner me-2"></i> Procesando...';

    const context = canvas.getContext('2d');
    // Ajusta el tamaño del canvas al tamaño del video para una captura correcta.
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // Dibuja la imagen actual del video en el canvas.
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convierte la imagen del canvas a una cadena Base64 para enviarla a la API.
    const imagenBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]; // 0.9 es la calidad de la imagen

    // Obtener la URL base64 completa para posible subida a Supabase Storage
    const imagenFullBase64 = canvas.toDataURL('image/jpeg', 0.9);

    detectarRostro(imagenBase64, imagenFullBase64);
});

/**
 * @function detectarRostro
 * @description Envía una imagen Base64 a la API de Face++ para detectar rostros y sus atributos.
 * Si se detecta un rostro, registra la asistencia en Supabase.
 * @param {string} imagenBase64 - La imagen del rostro codificada en Base64 (para Face++).
 * @param {string} imagenFullBase64 - La imagen completa codificada en Base64 (para Supabase Storage).
 * @returns {Promise<void>}
 */
async function detectarRostro(imagenBase64, imagenFullBase64) {
    mostrarMensaje('Procesando imagen...', 'info');

    const formData = new FormData();
    formData.append('api_key', API_KEY);
    formData.append('api_secret', API_SECRET);
    formData.append('image_base64', imagenBase64);
    formData.append('return_attributes', 'gender,age'); // Solicita atributos de género y edad

    let fotoUrlGuardada = null; // Variable para almacenar la URL de la foto en Supabase Storage

    try {
        // PASO 1: Subir la imagen a Supabase Storage (antes de detectar el rostro)
        // Esto es opcional, pero si quieres guardar la foto tomada, aquí es donde lo harías.
        // Necesitas tener un bucket configurado en Supabase Storage (ej. 'asistencia-fotos')
        // y políticas de RLS para permitir uploads anónimos si no hay autenticación.
        try {
            const fileName = `asistencia_rostro_${Date.now()}.jpeg`; // Nombre único para el archivo
            const { data: uploadData, error: uploadError } = await window.supabase.storage
                .from('asistencia-fotos') // Reemplaza 'asistencia-fotos' con el nombre de tu bucket
                .upload(fileName, decodeBase64Image(imagenFullBase64), {
                    contentType: 'image/jpeg',
                    upsert: false // No sobrescribir si el archivo ya existe
                });

            if (uploadError) {
                console.error('Error al subir la imagen a Supabase Storage:', uploadError.message);
                mostrarMensaje('Error al guardar la foto.', 'warning');
            } else {
                // Obtener la URL pública de la imagen subida
                const { data: publicUrlData } = window.supabase.storage
                    .from('asistencia-fotos') // Reemplaza 'asistencia-fotos' con el nombre de tu bucket
                    .getPublicUrl(fileName);
                fotoUrlGuardada = publicUrlData.publicUrl;
                console.log('Imagen subida a Supabase Storage:', fotoUrlGuardada);
            }
        } catch (storageErr) {
            console.error('Error en el proceso de Supabase Storage:', storageErr);
            mostrarMensaje('Error inesperado al subir la foto.', 'warning');
        }

        // PASO 2: Enviar la imagen a Face++ para búsqueda real
        formData.append('outer_id', FACESET_TOKEN); // Identificador de la colección creada

        const response = await fetch('https://api-us.faceplusplus.com/facepp/v3/search', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error HTTP de Face++: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const coincidencia = data.results[0]; // La cara con mejor match

            // Face++ recomienda al menos un valor de confidence > threshold (normalmente > ~70-80 pero usaremos su propio threshold recomendado: 1e-4)
            if (coincidencia.confidence < data.thresholds["1e-4"]) {
                mostrarMensaje('Rostro dudoso. Acércate más a la cámara o regístrate en el módulo de Admin.', 'warning');
                return;
            }

            const recognizedFaceToken = coincidencia.face_token;
            // Buscar a quién pertenece este token en la DB
            const { data: dbData, error: dbError } = await window.supabase
                .from('jugadores')
                .select('id, nombre, categoria')
                .eq('face_token', recognizedFaceToken)
                .single();

            if (dbError) {
                console.error("Error buscando en Supabase:", dbError);
                mostrarMensaje('Rostro reconocido por la cámara, pero no enlazado a ningún jugador activo en Supabase.', 'warning');
                return;
            }

            const jugador = dbData;
            mostrarMensaje(`¡Hola ${jugador.nombre}! Asistencia confirmada.`, 'success');

            // Sintetizador de Voz para leer el nombre en alto
            hablar(`Asistencia registrada para ${jugador.nombre}.`);

            agregarAsistencia(jugador.nombre, `Presente`);

            // Guarda la asistencia en Supabase con el ID real
            await guardarAsistenciaEnSupabase(jugador.id, true, 'Reconocimiento Facial', fotoUrlGuardada);

        } else if (data.faces && data.faces.length > 0) {
            mostrarMensaje('Rostro detectado pero no está en la base de datos de tu club. Pide a tu entrenador que te registre.', 'warning');
            hablar('Rostro no registrado. Solicita tu registro.');
        } else {
            mostrarMensaje('No se detectó ningún rostro. Intenta de nuevo.', 'warning');
            hablar('Ningún rostro detectado.');
        }
    } catch (error) {
        console.error('Error general en detectarRostro:', error);
        mostrarMensaje('Error al procesar la imagen. Consulta la consola para más detalles.', 'danger');
    } finally {
        // Restaurar estado del botón
        btnCapturar.disabled = false;
        btnCapturar.innerHTML = '<i class="fas fa-camera me-2"></i> Capturar Rostro';
    }
}

/**
 * @function hablar
 * @description Utiliza la API de síntesis de voz Web (TTS) para hablar un texto.
 */
function hablar(texto) {
    if ('speechSynthesis' in window) {
        const mensaje = new SpeechSynthesisUtterance(texto);
        mensaje.lang = 'es-CO'; // Español Colombia
        mensaje.rate = 1.0;
        window.speechSynthesis.speak(mensaje);
    }
}

/**
 * @function decodeBase64Image
 * @description Convierte una cadena Base64 (con prefijo 'data:image/jpeg;base64,') en un Blob.
 * Útil para subir imágenes a Supabase Storage.
 * @param {string} dataUrl - La cadena Base64 completa de la imagen.
 * @returns {Blob} Un objeto Blob que representa la imagen.
 */
function decodeBase64Image(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}


/**
 * @function mostrarMensaje
 * @description Muestra un mensaje en la interfaz de usuario con Toast de Bootstrap.
 * @param {string} texto - El contenido del mensaje a mostrar.
 * @param {string} tipo - El tipo de alerta (ej: 'info', 'success', 'warning', 'danger').
 */
function mostrarMensaje(texto, tipo) {
    const toastEl = document.getElementById('liveToast');
    if (!toastEl) {
        console.warn('Toast element not found, falling back to basic alert.');
        // Fallback en caso de que index.html no esté actualizado
        if (mensaje) {
            mensaje.className = `alert alert-${tipo} mt-3`;
            mensaje.textContent = texto;
            mensaje.classList.remove('d-none');
        }
        return;
    }

    const toastBody = document.getElementById('toast-body-content');

    toastEl.classList.remove('toast-success', 'toast-error', 'toast-warning', 'toast-info');

    let icono = '';
    if (tipo === 'success') {
        toastEl.classList.add('toast-success');
        icono = '<i class="fas fa-check-circle text-success fs-5"></i>';
    } else if (tipo === 'danger') {
        toastEl.classList.add('toast-error');
        icono = '<i class="fas fa-exclamation-circle text-danger fs-5"></i>';
    } else if (tipo === 'warning') {
        toastEl.classList.add('toast-warning');
        icono = '<i class="fas fa-exclamation-triangle text-warning fs-5"></i>';
    } else {
        toastEl.classList.add('toast-info');
        icono = '<i class="fas fa-info-circle text-primary fs-5"></i>';
    }

    toastBody.innerHTML = `${icono} <span class="fw-medium">${texto}</span>`;

    const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
    toast.show();
}

/**
 * @function agregarAsistencia
 * @description Agrega visualmente un nuevo elemento de asistencia a la lista.
 * @param {string} nombre - El nombre del jugador o descripción de la asistencia.
 * @param {string} estado - El estado de la asistencia (ej: 'Presente', 'Ausente').
 */
function agregarAsistencia(nombre, estado) {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2';

    const icon = estado.includes('Presente') ? '<i class="fas fa-user-check text-success me-2"></i>' : '<i class="fas fa-user-times text-danger me-2"></i>';

    li.innerHTML = `
        <div class="d-flex align-items-center">
            ${icon}
            <span class="fw-semibold">${nombre}</span>
        </div>
        <span class="badge bg-success rounded-pill shadow-sm">${estado}</span>
    `;
    listaAsistencias.prepend(li); // Agrega al principio para ver las más recientes.
}

/**
 * @function cargarAsistencias
 * @description Carga los registros de asistencia desde Supabase y los muestra en la interfaz.
 * @returns {Promise<void>}
 */
async function cargarAsistencias() {
    // Verifica si el cliente supabase está disponible globalmente.
    if (!window.supabase) {
        mostrarMensaje('Cliente Supabase no inicializado. No se pudieron cargar las asistencias.', 'danger');
        console.error('El cliente Supabase (window.supabase) no está disponible. Asegúrate de que se inicialice en index.html');
        return;
    }

    try {
        // Realiza la consulta a la tabla 'asistencias' y une con la tabla 'jugadores'.
        // Aquí 'supabase' se refiere a 'window.supabase'.
        const { data, error } = await window.supabase
            .from('asistencias')
            .select(`
                id,
                fecha,
                tipo_evento,
                asistio,
                jugadores (nombre) // Esto traerá el nombre del jugador si jugador_id está enlazado
            `)
            .order('fecha', { ascending: false }); // Ordena por fecha descendente (más reciente primero).

        if (error) {
            console.error('Error al cargar asistencias desde Supabase:', error.message);
            mostrarMensaje('Error al cargar asistencias.', 'danger');
            return;
        }

        listaAsistencias.innerHTML = ''; // Limpiar la lista antes de añadir los nuevos elementos.

        if (data.length === 0) {
            const noAsistenciasItem = document.createElement('li');
            noAsistenciasItem.className = 'list-group-item text-center text-muted';
            noAsistenciasItem.textContent = 'No hay asistencias registradas aún.';
            listaAsistencias.appendChild(noAsistenciasItem);
        } else {
            data.forEach(asistencia => {
                // Obtiene el nombre del jugador si está disponible, de lo contrario un marcador de posición.
                const nombre = asistencia.jugadores ? asistencia.jugadores.nombre : 'Jugador No Identificado';
                const estado = asistencia.asistio ? 'Presente' : 'Ausente';
                const clase = asistencia.asistio ? 'bg-success' : 'bg-danger';
                // Formatea la fecha para mostrarla de manera legible (solo fecha para columna `date`).
                const fecha = new Date(asistencia.fecha).toLocaleDateString('es-CO'); // Formato de fecha para Colombia

                const icon = asistencia.asistio ? '<i class="fas fa-user-check text-success me-2"></i>' : '<i class="fas fa-user-times text-danger me-2"></i>';

                const item = document.createElement('li');
                item.className = 'list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2';
                item.innerHTML = `
                    <div class="d-flex align-items-center flex-grow-1">
                        ${icon}
                        <div>
                            <span class="fw-semibold d-block">${nombre}</span>
                            <small class="text-muted d-block" style="font-size: 0.75rem;"><i class="fas fa-tag me-1"></i>${asistencia.tipo_evento || 'Evento General'}</small>
                        </div>
                    </div>
                    <span class="badge ${clase} rounded-pill shadow-sm">${estado} - ${fecha}</span>
                `;
                listaAsistencias.appendChild(item);
            });
        }
    } catch (error) {
        console.error('Error inesperado al cargar asistencias:', error);
        mostrarMensaje('Error inesperado al cargar asistencias.', 'danger');
    }
}

/**
 * @function guardarAsistenciaEnSupabase
 * @description Guarda un nuevo registro de asistencia en la tabla 'asistencias' de Supabase.
 * @param {string | null} jugadorId - El ID UUID del jugador si está identificado, de lo contrario `null`.
 * @param {boolean} asistioStatus - Verdadero si el jugador asistió, falso si no.
 * @param {string} tipoEvento - El tipo de evento (ej: 'Reconocimiento Facial').
 * @param {string | null} fotoTomadaUrl - La URL pública de la foto tomada, o `null` si no se guardó.
 * @returns {Promise<void>}
 */
async function guardarAsistenciaEnSupabase(jugadorId, asistioStatus, tipoEvento, fotoTomadaUrl) {
    if (!window.supabase) {
        console.error('Cliente Supabase no disponible para guardar asistencia.');
        mostrarMensaje('Error: Cliente Supabase no inicializado para guardar.', 'danger');
        return;
    }
    try {
        // Obtener solo la fecha actual sin la hora, para la columna `fecha` de tipo `date`.
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0'); // Meses son 0-based
        const dd = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}-${mm}-${dd}`; // Formato 'YYYY-MM-DD'

        const { data, error } = await window.supabase
            .from('asistencias')
            .insert([
                {
                    jugador_id: jugadorId,      // Será null por ahora, a menos que identifiques al jugador
                    fecha: formattedDate,       // Solo la fecha
                    tipo_evento: tipoEvento,
                    asistio: asistioStatus,
                    fuente: 'reconocimiento_facial', // Ya tiene un default, pero se puede enviar explícitamente
                    foto_tomada_url: fotoTomadaUrl // La URL de la foto subida
                }
            ])
            .select(); // Para obtener los datos insertados, útil para depuración

        if (error) {
            console.error('Error guardando asistencia en Supabase:', error.message);
            mostrarMensaje(`Error al guardar asistencia en BD: ${error.message}`, 'danger');
        } else {
            console.log('Asistencia guardada en Supabase:', data);
            mostrarMensaje('Asistencia registrada en BD correctamente.', 'success');
            cargarAsistencias(); // Refrescar la lista de asistencias para mostrar el nuevo registro.
        }
    } catch (err) {
        console.error('Error inesperado al intentar guardar en Supabase:', err);
        mostrarMensaje('Error inesperado al guardar en BD.', 'danger');
    }
}

// Carga las asistencias cuando el contenido del DOM ha sido completamente cargado.
document.addEventListener('DOMContentLoaded', cargarAsistencias);