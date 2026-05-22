// CONFIGURACIÓN: Pega aquí tu URL de Google Apps Script cuando la tengas
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbym7TPQgA30XgxlFaZxcIboCj4nkvgj4xKu7WAjb5OtbltT41AwVcvWkGT26yOkiund/exec";

// Base de datos en memoria local para cálculo inmediato en pantalla
let estadoApp = {
    caja: 0,
    porCobrar: 0,
    inversionA: 0,
    inversionB: 0,
    inventario: []
};

// 1. CONTROL DE NAVEGACIÓN MÓVIL
function switchTab(sectionId) {
    document.querySelectorAll('.app-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(sectionId).classList.add('active');
    
    // Marcar botón activo de la barra inferior
    const btnIndex = ['sec-dashboard', 'sec-ventas', 'sec-gastos', 'sec-inventario'].indexOf(sectionId);
    if(btnIndex !== -1) {
        document.querySelectorAll('.nav-btn')[btnIndex].classList.add('active');
    }
}

// 2. CÁLCULO DE CUENTAS EQUITATIVAS ENTRE SOCIAS
function recalcularDashboard() {
    document.getElementById('dash-caja').innerText = `$${estadoApp.caja.toFixed(2)}`;
    document.getElementById('dash-por-cobrar').innerText = `$${estadoApp.porCobrar.toFixed(2)}`;
    document.getElementById('dash-inv-a').innerText = `$${estadoApp.inversionA.toFixed(2)}`;
    document.getElementById('dash-inv-b').innerText = `$${estadoApp.inversionB.toFixed(2)}`;

    const contenedorLiquidacion = document.getElementById('dash-liquidacion');
    
    // Fórmula de compensación para ir a partes iguales con nombres reales
    if (estadoApp.inversionA === estadoApp.inversionB) {
        contenedorLiquidacion.innerText = "¡Bárbara y Angie están a la par! Ninguna debe nada.";
    } else if (estadoApp.inversionA > estadoApp.inversionB) {
        const deuda = (estadoApp.inversionA - estadoApp.inversionB) / 2;
        contenedorLiquidacion.innerText = `Angie debe pagarle $${deuda.toFixed(2)} a Bárbara para ir a medias.`;
    } else {
        const deuda = (estadoApp.inversionB - estadoApp.inversionA) / 2;
        contenedorLiquidacion.innerText = `Bárbara debe pagarle $${deuda.toFixed(2)} a Angie para ir a medias.`;
    }
}

// 3. CAPTURA Y PRORRATEO DE LOTE (INVENTARIO)
document.getElementById('form-inventario').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const nombre = document.getElementById('i-nombre').value;
    const cantidad = parseInt(document.getElementById('i-cantidad').value);
    const costoBase = parseFloat(document.getElementById('i-costo-base').value);
    const envioTotal = parseFloat(document.getElementById('i-envio-total').value);
    const financiador = document.getElementById('i-financiador').value;

    // Cálculo del Costo Real Unitario absorbiendo el envío
    const costoRealUnitario = costoBase + (envioTotal / cantidad);
    const inversionTotalLote = (costoBase * cantidad) + envioTotal;

    // Actualizar estados financieros según quién pagó
    if (financiador === 'Socia A') estadoApp.inversionA += inversionTotalLote;
    if (financiador === 'Socia B') estadoApp.inversionB += inversionTotalLote;
    if (financiador === 'Caja') estadoApp.caja -= inversionTotalLote;
    if (financiador === 'Mitad') {
        const mitadGasto = inversionTotalLote / 2;
        estadoApp.inversionA += mitadGasto;
        estadoApp.inversionB += mitadGasto;
    }

    // Añadir artículo al listado visual rápido
    estadoApp.inventario.push({ nombre, cantidad, costoRealUnitario });
    renderizarInventario();
    recalcularDashboard();

    // Enviar datos hacia el backend de Google Sheet
    enviarDatosAGoogle("Inventario", { nombre, cantidad, costoBase, envioTotal, costoRealUnitario, financiador });
    
    this.reset();
    alert("¡Lote e inversión registrados!");
});

function renderizarInventario() {
    const contenedor = document.getElementById('lista-inventario');
    contenedor.innerHTML = "";
    estadoApp.inventario.forEach(item => {
        const div = document.createElement('div');
        div.className = `ticket-item ${item.cantidad < 3 ? 'card-loss' : 'card-normal'}`;
        div.innerHTML = `<div><strong>${item.nombre}</strong><br><small>Costo Real U.: $${item.costoRealUnitario.toFixed(2)}</small></div>
                         <div style="font-weight:bold;">${item.cantidad} uds</div>`;
        contenedor.appendChild(div);
    });
}

// 4. CAPTURA DE VENTAS
document.getElementById('form-venta').addEventListener('submit', function(e) {
    e.preventDefault();
    const producto = document.getElementById('v-producto').value;
    const categoria = document.getElementById('v-categoria').value;
    const cliente = document.getElementById('v-cliente').value;
    const precio = parseFloat(document.getElementById('v-precio').value);
    const pagado = document.getElementById('v-pagado').checked;
    const socia = document.getElementById('v-socia').value;

    if (pagado) {
        estadoApp.caja += precio;
    } else {
        estadoApp.porCobrar += precio;
    }

    recalcularDashboard();
    enviarDatosAGoogle("Ventas", { producto, categoria, cliente, precio, pagado, socia });
    
    this.reset();
    alert("¡Venta registrada con éxito!");
});

// 5. CAPTURA DE GASTOS EXTRAS
document.getElementById('form-gasto').addEventListener('submit', function(e) {
    e.preventDefault();
    const concepto = document.getElementById('g-concepto').value;
    const monto = parseFloat(document.getElementById('g-monto').value);
    const pagador = document.getElementById('g-pagador').value;

    if (pagador === 'Socia A') estadoApp.inversionA += monto;
    if (pagador === 'Socia B') estadoApp.inversionB += monto;
    if (pagador === 'Caja') estadoApp.caja -= monto;
    if (pagador === 'Mitad') {
        const mitadGasto = monto / 2;
        estadoApp.inversionA += mitadGasto;
        estadoApp.inversionB += mitadGasto;
    }

    recalcularDashboard();
    enviarDatosAGoogle("Gastos", { concepto, monto, pagador });

    this.reset();
    alert("¡Gasto extra registrado!");
});

// 6. FUNCIÓN DE ENVÍO DIRECTO A GOOGLE SHEETS VIA FETCH API
async function enviarDatosAGoogle(pestana, datos) {
    if(SCRIPT_URL === "TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI") return;
    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetTab: pestana, ...datos })
        });
    } catch (error) {
        console.error("Error al sincronizar con Google Sheets:", error);
    }
}

// Inicializar vista
recalcularDashboard();
// Función para cargar absolutamente todo desde Google Sheets al abrir la app
async function cargarDatosDesdeGoogle() {
    try {
        // 1. Traer y renderizar la lista visual de productos
        const resInventario = await fetch(SCRIPT_URL + "?accion=obtenerInventario");
        const datosInventario = await resInventario.json();
        if (datosInventario && datosInventario.length > 0) {
            estadoApp.inventario = datosInventario;
            renderizarInventario();
        }

        // 2. Traer los totales de caja, cobros e inversiones reales de las chicas
        const resFinanzas = await fetch(SCRIPT_URL + "?accion=obtenerTotalesFinancieros");
        const datosFinanzas = await resFinanzas.json();
        if (datosFinanzas && !datosFinanzas.error) {
            estadoApp.caja = datosFinanzas.caja;
            estadoApp.inversionA = datosFinanzas.inversionA;
            estadoApp.inversionB = datosFinanzas.inversionB;
            estadoApp.porCobrar = datosFinanzas.porCobrar;
        }

        // 3. Forzar a que las tarjetas de arriba se recalculen y se dibujen bien
        recalcularDashboard();

    } catch (error) {
        console.error("Error al sincronizar datos iniciales con Google Sheets:", error);
    }
}

// Cambiar la ejecución inicial por la nueva función completa
window.onload = cargarDatosDesdeGoogle;

// Función mejorada y blindada para cargar datos sin bloquearse
async function cargarDatosDesdeGoogle() {
    // 1. Intentar cargar el Inventario por separado
    try {
        const resInventario = await fetch(SCRIPT_URL + "?accion=obtenerInventario");
        const datosInventario = await resInventario.json();
        if (datosInventario && datosInventario.length > 0) {
            estadoApp.inventario = datosInventario;
            renderizarInventario();
            console.log("Inventario cargado con éxito.");
        }
    } catch (error) {
        console.error("Error al cargar Inventario:", error);
    }

    // 2. Intentar cargar las Finanzas por separado (si falla, no rompe el inventario)
    try {
        const resFinanzas = await fetch(SCRIPT_URL + "?accion=obtenerTotalesFinancieros");
        const datosFinanzas = await resFinanzas.json();
        if (datosFinanzas && !datosFinanzas.error) {
            estadoApp.caja = datosFinanzas.caja;
            estadoApp.inversionA = datosFinanzas.inversionA;
            estadoApp.inversionB = datosFinanzas.inversionB;
            estadoApp.porCobrar = datosFinanzas.porCobrar;
            console.log("Finanzas cargadas con éxito.");
        } else if (datosFinanzas.error) {
            console.error("Error devuelto por Google:", datosFinanzas.error);
        }
    } catch (error) {
        console.error("Error de conexión al cargar Finanzas:", error);
    }

    // 3. Pase lo que pase, refrescar los paneles con lo que tengamos
    recalcularDashboard();
}

// Asegurar la ejecución al arrancar
window.onload = cargarDatosDesdeGoogle;