// ==========================================================================
// STATE MANAGEMENT & DATA HANDLER
// ==========================================================================
let appData = null;
let charts = {};

// Auto-Rotation variables
const ROTATION_TIME = 15000; // 15 seconds
let progressInterval = null;
let rotationEnabled = true;
let currentTabIndex = 0;
let elapsedRotationTime = 0;

const STORAGE_KEY_CIL = 'url_csv_cilindros';
const STORAGE_KEY_PH = 'url_csv_ph';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupNavigation();
    setupConnectionForm();
});

/**
 * Initialize application data and charts
 */
async function initApp() {
    // showToast('Iniciando sistema...', 'syncing', 'Información');
    
    const savedCilUrl = localStorage.getItem(STORAGE_KEY_CIL);
    const savedPhUrl = localStorage.getItem(STORAGE_KEY_PH);
    
    if (savedCilUrl && savedPhUrl) {
        const inputCil = document.getElementById('input-url-cilindros');
        const inputPh = document.getElementById('input-url-ph');
        if (inputCil) inputCil.value = savedCilUrl;
        if (inputPh) inputPh.value = savedPhUrl;
        
        try {
            showToast('Conectando con Google Sheets...', 'syncing', 'Sincronización');
            const data = await fetchFromGoogleSheets(savedCilUrl, savedPhUrl);
            appData = data;
            updateConnectionStatus(true, 'Google Sheets Sincronizado');
            showToast('Datos cargados desde Google Sheets.', 'success', 'Sincronizado');
        } catch (error) {
            console.error('Error loading Google Sheets:', error);
            showToast('Error cargando Google Sheets. Usando datos locales.', 'error', 'Error');
            appData = INITIAL_DATA;
            updateConnectionStatus(false, 'Local (Error en Google Sheets)');
        }
    } else {
        appData = INITIAL_DATA;
        updateConnectionStatus(false, 'Modo Local (Excel)');
    }
    
    renderDashboard();
    startRotation();
    
    const timeStr = appData.metadata && appData.metadata.fecha_actualizacion 
        ? appData.metadata.fecha_actualizacion.split(' ')[1] 
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeEl = document.getElementById('last-update-time');
    if (timeEl) {
        timeEl.innerText = `Actualizado: ${timeStr}`;
    }
}

/**
 * Update connection badge in sidebar
 */
function updateConnectionStatus(isConnected, text) {
    const badge = document.getElementById('connection-status-badge');
    const badgeText = document.getElementById('connection-status-text');
    
    if (badge) {
        if (isConnected) {
            badge.className = 'status-badge sheets-connected';
        } else {
            badge.className = 'status-badge live';
        }
    }
    if (badgeText) {
        badgeText.innerText = text;
    }
}

// ==========================================================================
// NAVIGATION, AUTO-ROTATION & INTERACTION
// ==========================================================================
function setupNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('href').substring(1);
            
            // Perform switch tab with timer reset (user clicked manually)
            switchTab(targetId, true);
        });
    });

    // Synchronize now button
    const btnSync = document.getElementById('btn-sync-now');
    if (btnSync) {
        btnSync.addEventListener('click', async () => {
            const savedCilUrl = localStorage.getItem(STORAGE_KEY_CIL);
            const savedPhUrl = localStorage.getItem(STORAGE_KEY_PH);
            
            if (savedCilUrl && savedPhUrl) {
                showToast('Actualizando datos...', 'syncing', 'Sincronización');
                try {
                    const data = await fetchFromGoogleSheets(savedCilUrl, savedPhUrl);
                    appData = data;
                    renderDashboard();
                    updateConnectionStatus(true, 'Google Sheets Sincronizado');
                    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const timeEl = document.getElementById('last-update-time');
                    if (timeEl) {
                        timeEl.innerText = `Actualizado: ${nowStr}`;
                    }
                    showToast('Actualización completada.', 'success', 'Sincronizado');
                    
                    // If update successful, reset rotation timer
                    elapsedRotationTime = 0;
                } catch (error) {
                    console.error('Error syncing:', error);
                    showToast('Error de sincronización.', 'error', 'Error');
                }
            } else {
                showToast('Actualmente en modo local. No hay hoja configurada.', 'error', 'Modo Local');
            }
        });
    }
}

/**
 * Handle tab switching logic
 */
function switchTab(tabId, resetTimer = true) {
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.dashboard-section');
    
    const activeLink = document.getElementById(`menu-${tabId}`);
    if (!activeLink) return;
    
    menuItems.forEach(m => m.classList.remove('active'));
    activeLink.classList.add('active');
    
    sections.forEach(sec => {
        if (sec.id === tabId) {
            sec.classList.add('active-section');
        } else {
            sec.classList.remove('active-section');
        }
    });
    
    const tabs = ['overview', 'cilindros', 'ph'];
    const idx = tabs.indexOf(tabId);
    
    if (idx !== -1) {
        currentTabIndex = idx;
        rotationEnabled = true;
        document.getElementById('rotation-badge').innerHTML = '<i class="fa-solid fa-arrows-spin fa-spin"></i> <span>Auto-Rotación</span>';
        document.getElementById('rotation-badge').style.opacity = '1';
    } else {
        // Paused on Settings tab
        rotationEnabled = false;
        document.getElementById('rotation-progress').style.width = '0%';
        document.getElementById('rotation-badge').innerHTML = '<i class="fa-solid fa-circle-pause"></i> <span>Rotación Pausada</span>';
        document.getElementById('rotation-badge').style.opacity = '0.7';
    }
    
    if (resetTimer) {
        elapsedRotationTime = 0;
        document.getElementById('rotation-progress').style.width = '0%';
    }
    
    // Resize ChartJS components to fit container
    setTimeout(() => {
        Object.values(charts).forEach(chart => {
            chart.resize();
            chart.update('none');
        });
    }, 50);
}

/**
 * Starts the rotation progress bar and cycle timer
 */
function startRotation() {
    if (progressInterval) clearInterval(progressInterval);
    
    const progressBar = document.getElementById('rotation-progress');
    const intervalMs = 100;
    elapsedRotationTime = 0;
    
    progressInterval = setInterval(() => {
        if (!rotationEnabled) return;
        
        elapsedRotationTime += intervalMs;
        const pct = Math.min((elapsedRotationTime / ROTATION_TIME) * 100, 100);
        progressBar.style.width = `${pct}%`;
        
        if (elapsedRotationTime >= ROTATION_TIME) {
            elapsedRotationTime = 0;
            progressBar.style.width = '0%';
            cycleTab();
        }
    }, intervalMs);
}

/**
 * Cycle to the next tab in the loop
 */
function cycleTab() {
    const tabs = ['overview', 'cilindros', 'ph'];
    currentTabIndex = (currentTabIndex + 1) % tabs.length;
    const nextTab = tabs[currentTabIndex];
    switchTab(nextTab, false); // Switch without clearing elapsed timer since it's an auto cycle
}

// ==========================================================================
// FORM SETUP (GOOGLE SHEETS INTEGRATION)
// ==========================================================================
function setupConnectionForm() {
    const form = document.getElementById('form-data-connection');
    const btnReset = document.getElementById('btn-reset-connection');
    
    if (!form || !btnReset) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const urlCil = document.getElementById('input-url-cilindros').value.trim();
        const urlPh = document.getElementById('input-url-ph').value.trim();
        
        if (!urlCil || !urlPh) {
            showToast('Ingrese ambas URLs de Google Sheets.', 'error', 'Formulario Incompleto');
            return;
        }
        
        showToast('Guardando y conectando...', 'syncing', 'Validación');
        
        try {
            const testData = await fetchFromGoogleSheets(urlCil, urlPh);
            
            localStorage.setItem(STORAGE_KEY_CIL, urlCil);
            localStorage.setItem(STORAGE_KEY_PH, urlPh);
            
            appData = testData;
            renderDashboard();
            updateConnectionStatus(true, 'Google Sheets Sincronizado');
            
            const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const timeEl = document.getElementById('last-update-time');
            if (timeEl) {
                timeEl.innerText = `Actualizado: ${nowStr}`;
            }
            
            showToast('Conectado con éxito a Google Sheets.', 'success', 'Conexión Exitosa');
            
            // Auto switch to Vista General
            switchTab('overview', true);
        } catch (error) {
            console.error(error);
            showToast('Fallo al conectar. Revise las URLs e intente de nuevo.', 'error', 'Error de Conexión');
        }
    });
    
    btnReset.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY_CIL);
        localStorage.removeItem(STORAGE_KEY_PH);
        
        document.getElementById('input-url-cilindros').value = '';
        document.getElementById('input-url-ph').value = '';
        
        showToast('Restableciendo a modo local...', 'syncing', 'Restablecimiento');
        
        appData = INITIAL_DATA;
        renderDashboard();
        updateConnectionStatus(false, 'Modo Local (Excel)');
        
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeEl = document.getElementById('last-update-time');
        if (timeEl) {
            timeEl.innerText = `Actualizado: ${nowStr}`;
        }
        
        showToast('Restablecido a datos locales de Excel.', 'success', 'Restablecido');
        switchTab('overview', true);
    });
}

// ==========================================================================
// RENDER METHODS (DOM UPDATES)
// ==========================================================================
function renderDashboard() {
    renderKPIs();
    renderTables();
    initOrUpdateCharts();
}

/**
 * Populate KPI widgets at the top
 */
function renderKPIs() {
    // Update month and year dynamically in header and badges
    const monthFullNames = {
        'Ene': 'Enero', 'Feb': 'Febrero', 'Mar': 'Marzo', 'Abr': 'Abril',
        'May': 'Mayo', 'Jun': 'Junio', 'Jul': 'Julio', 'Ago': 'Agosto',
        'Sep': 'Septiembre', 'Oct': 'Octubre', 'Nov': 'Noviembre', 'Dic': 'Diciembre'
    };
    const monthList = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    let reportDateStr = 'Agosto 2026';
    let reportMonthOnly = 'Agosto';
    let reportYear = '2026';
    
    if (appData.metadata && appData.metadata.fecha_reporte) {
        const parts = appData.metadata.fecha_reporte.trim().split(' ');
        if (parts.length === 2) {
            reportMonthOnly = monthFullNames[parts[0]] || parts[0];
            reportYear = parts[1];
            reportDateStr = `${reportMonthOnly} ${reportYear}`;
        } else {
            reportDateStr = appData.metadata.fecha_reporte;
            reportMonthOnly = parts[0];
            if (parts[1]) reportYear = parts[1];
        }
    }
    
    // Calculate previous month name
    const currentMonthIdx = monthList.findIndex(m => m.toLowerCase().startsWith(reportMonthOnly.toLowerCase().substring(0, 3)));
    let prevMonthName = 'Julio';
    if (currentMonthIdx !== -1) {
        const prevMonthIdx = (currentMonthIdx - 1 + 12) % 12;
        prevMonthName = monthList[prevMonthIdx];
    }

    const reportPeriodEl = document.getElementById('report-period-text');
    if (reportPeriodEl) {
        reportPeriodEl.innerText = reportDateStr;
    }
    
    // Update Vista General badges dynamically
    const cilMonthBadge = document.getElementById('overview-cil-month-badge');
    if (cilMonthBadge) {
        cilMonthBadge.innerText = reportMonthOnly;
    }
    const phMonthBadge = document.getElementById('overview-ph-month-badge');
    if (phMonthBadge) {
        phMonthBadge.innerText = reportMonthOnly;
    }
    const valvMonthBadge = document.getElementById('overview-valv-month-badge');
    if (valvMonthBadge) {
        valvMonthBadge.innerText = reportMonthOnly;
    }

    // Update PH comparison title and labels dynamically
    const phComparisonTitle = document.getElementById('ph-comparison-title');
    if (phComparisonTitle) {
        phComparisonTitle.innerText = `Pruebas realizadas: ${prevMonthName} vs ${reportMonthOnly} ${reportYear}`;
    }
    const phCompLabelPrev = document.getElementById('ph-comp-label-prev');
    if (phCompLabelPrev) {
        phCompLabelPrev.innerText = `${prevMonthName} (Mes Anterior)`;
    }
    const phCompLabelCurr = document.getElementById('ph-comp-label-curr');
    if (phCompLabelCurr) {
        phCompLabelCurr.innerText = `${reportMonthOnly} (Mes Actual)`;
    }

    const prodVal = appData.cilindros.summary.prod_mensual_2 || appData.cilindros.summary.prod_mensual_1;
    document.getElementById('kpi-cil-value').innerText = formatPercent(prodVal);
    document.getElementById('cil-prod-1-percent').innerText = formatPercent(appData.cilindros.summary.prod_mensual_1);
    document.getElementById('cil-prod-2-percent').innerText = formatPercent(appData.cilindros.summary.prod_mensual_2);
    
    document.getElementById('cil-prod-1-bar').style.width = formatPercent(appData.cilindros.summary.prod_mensual_1);
    document.getElementById('cil-prod-2-bar').style.width = formatPercent(appData.cilindros.summary.prod_mensual_2);
    
    const phTotal = appData.ph.summary.rocha_total_pruebas;
    document.getElementById('kpi-ph-value').innerText = phTotal;
    document.getElementById('val-ph-total-tests').innerText = phTotal;
    
    const julyTests = appData.ph.summary.comparativa_julio || 1273;
    const augustTests = appData.ph.summary.comparativa_agosto || phTotal;
    document.getElementById('comp-val-july').innerText = formatNumber(julyTests);
    document.getElementById('comp-val-august').innerText = formatNumber(augustTests);
    
    const kpiPhTrend = document.getElementById('kpi-ph-trend');
    if (kpiPhTrend) {
        kpiPhTrend.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> vs ${prevMonthName} (${formatNumber(julyTests)})`;
    }
    
    const maxVal = Math.max(julyTests, augustTests);
    document.getElementById('comp-bar-july').style.width = maxVal > 0 ? `${(julyTests / maxVal) * 100}%` : '0%';
    document.getElementById('comp-bar-august').style.width = maxVal > 0 ? `${(augustTests / maxVal) * 100}%` : '0%';
    
    const phRate = appData.ph.summary.ph_por_hora;
    const phMeta = appData.ph.summary.meta_por_hora || 10.0;
    const phCumplimiento = appData.ph.summary.cumplimiento || (phMeta > 0 ? phRate / phMeta : 0);
    document.getElementById('kpi-ph-rate-value').innerHTML = `${phRate.toFixed(2)} <span class="unit">/ hr</span>`;
    document.getElementById('kpi-ph-rate-trend').innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Meta: ${phMeta.toFixed(1)} / hr`;
    document.getElementById('kpi-ph-efficiency').querySelector('.kpi-subtext').innerText = `Cumplimiento del ${formatPercent(phCumplimiento)}`;
    
    document.getElementById('ph-rate-metric').innerText = phRate.toFixed(2);
    document.getElementById('val-ph-cumplimiento').innerText = formatPercent(phCumplimiento);
    document.getElementById('val-ph-total-hours').innerText = `${appData.ph.summary.total_horas.toFixed(1)} hrs`;
    
    const lostHours = appData.cilindros.summary.total_horas_perdidas;
    const lostDays = appData.cilindros.summary.total_dias_perdidos;
    const lostHoursProm = appData.cilindros.summary.prom_horas_perdidas;
    
    const kpiLostHoursVal = document.getElementById('kpi-lost-hours-value');
    if (kpiLostHoursVal) kpiLostHoursVal.innerHTML = `${lostHours.toFixed(1)} <span class="unit">hrs</span>`;
    const kpiLostDaysVal = document.getElementById('kpi-lost-days-value');
    if (kpiLostDaysVal) kpiLostDaysVal.innerHTML = `<i class="fa-solid fa-calendar-minus"></i> ${lostDays.toFixed(1)} días`;
    const kpiLostHoursCard = document.getElementById('kpi-lost-hours');
    if (kpiLostHoursCard) kpiLostHoursCard.querySelector('.kpi-subtext').innerText = `Promedio: ${lostHoursProm.toFixed(1)} hrs/d`;
    
    const valRochaCil = document.getElementById('val-rocha-cil');
    if (valRochaCil) valRochaCil.innerText = `${appData.cilindros.summary.rocha_cil_trabajados} PH`;
    const valRochaPhTime = document.getElementById('val-rocha-ph-time');
    if (valRochaPhTime) valRochaPhTime.innerText = `${appData.cilindros.summary.rocha_tiempo_ph} min`;
    const valRochaValvTime = document.getElementById('val-rocha-valv-time');
    if (valRochaValvTime) valRochaValvTime.innerText = `${appData.cilindros.summary.rocha_tiempo_prom_valvulas} min`;
    const valRochaPhEquiv = document.getElementById('val-rocha-ph-equiv');
    if (valRochaPhEquiv) valRochaPhEquiv.innerText = `${appData.cilindros.summary.rocha_ph_equiv} PH equiv`;
    
    const valCilObjDevalv = document.getElementById('val-cil-obj-devalv');
    if (valCilObjDevalv) valCilObjDevalv.innerText = appData.cilindros.summary.objetivo_devalvulados;
    const valCilLostHoursProm = document.getElementById('val-cil-lost-hours-prom');
    if (valCilLostHoursProm) valCilLostHoursProm.innerText = `${lostHoursProm.toFixed(1)} hrs`;

    // Sincronizar comparativa histórica de cilindros
    const cilPrev = appData.cilindros.summary.comparativa_anterior || 0;
    const cilCurr = appData.cilindros.summary.comparativa_actual || 0;
    
    const compValCilPrev = document.getElementById('comp-val-cil-prev');
    if (compValCilPrev) compValCilPrev.innerText = formatNumber(cilPrev);
    const compValCilCurr = document.getElementById('comp-val-cil-curr');
    if (compValCilCurr) compValCilCurr.innerText = formatNumber(cilCurr);

    const cilComparisonTitle = document.getElementById('cil-comparison-title');
    if (cilComparisonTitle) {
        cilComparisonTitle.innerText = `Cilindros trabajados: ${prevMonthName} vs ${reportMonthOnly} ${reportYear}`;
    }
    const cilCompLabelPrev = document.getElementById('cil-comp-label-prev');
    if (cilCompLabelPrev) {
        cilCompLabelPrev.innerText = `${prevMonthName} (Mes Anterior)`;
    }
    const cilCompLabelCurr = document.getElementById('cil-comp-label-curr');
    if (cilCompLabelCurr) {
        cilCompLabelCurr.innerText = `${reportMonthOnly} (Mes Actual)`;
    }
    
    const maxCilVal = Math.max(cilPrev, cilCurr);
    const compBarCilPrev = document.getElementById('comp-bar-cil-prev');
    if (compBarCilPrev) {
        compBarCilPrev.style.width = maxCilVal > 0 ? `${(cilPrev / maxCilVal) * 100}%` : '0%';
    }
    const compBarCilCurr = document.getElementById('comp-bar-cil-curr');
    if (compBarCilCurr) {
        compBarCilCurr.style.width = maxCilVal > 0 ? `${(cilCurr / maxCilVal) * 100}%` : '0%';
    }
    
    const cilObsEl = document.getElementById('cil-comparison-obs');
    if (cilObsEl) {
        if (cilCurr > cilPrev) {
            cilObsEl.innerText = "Incremento en las tareas de mantenimiento de cilindros respecto al mes anterior.";
        } else if (cilCurr < cilPrev) {
            cilObsEl.innerText = "Disminución en las tareas de mantenimiento de cilindros respecto al mes anterior.";
        } else {
            cilObsEl.innerText = "Productividad de mantenimiento estable en comparación al mes anterior.";
        }
    }
}

/**
 * Render tables with a limit of 10 rows to fit screen height perfectly
 */
function renderTables() {
    // 1. Cilindros Table
    const tbodyCil = document.getElementById('tbody-cilindros');
    tbodyCil.innerHTML = '';
    
    const cilDates = appData.cilindros.dates;
    const cilActs = appData.cilindros.activities;
    const cilTimes = appData.cilindros.daily_times;
    
    const activeCilRows = [];
    for (let i = 0; i < cilDates.length; i++) {
        const hasWork = cilTimes.tiempo_trabajo[i] > 0 || cilTimes.tiempo_estandar_total[i] > 0;
        const totalActs = cilActs.cambios_valvula[i] + cilActs.devalvulado[i] + cilActs.valvulado[i] + cilActs.pulido[i] + cilActs.cambio_disco[i] + cilActs.revision_interna[i] + cilActs.lavado_contaminados[i];
        
        if (hasWork || totalActs > 0) {
            activeCilRows.push({
                date: formatDisplayDate(cilDates[i]),
                cambios: cilActs.cambios_valvula[i],
                devalvulado: cilActs.devalvulado[i],
                valvulado: cilActs.valvulado[i],
                pulido: cilActs.pulido[i],
                estandar: cilTimes.tiempo_estandar_total[i],
                trabajo: cilTimes.tiempo_trabajo[i],
                prod: cilTimes.productividad[i]
            });
        }
    }
    
    // Take ONLY the last 10 rows to fit screen height perfectly
    const visibleCilRows = activeCilRows.slice(-10);
    visibleCilRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${row.date}</strong></td>
            <td>${row.cambios}</td>
            <td>${row.devalvulado}</td>
            <td>${row.valvulado}</td>
            <td>${row.pulido}</td>
            <td>${row.estandar.toFixed(2)}</td>
            <td>${row.trabajo.toFixed(2)}</td>
            <td class="cell-percent" style="color: ${getPercentColor(row.prod)}">${formatPercent(row.prod)}</td>
        `;
        tbodyCil.appendChild(tr);
    });
    
    // 2. PH Table
    const tbodyPH = document.getElementById('tbody-ph');
    tbodyPH.innerHTML = '';
    
    const phDates = appData.ph.dates;
    const phDaily = appData.ph.daily;
    
    const activePhRows = [];
    for (let i = 0; i < phDates.length; i++) {
        const hasWork = phDaily.tiempo_dia[i] > 0 || phDaily.pruebas_rocha[i] > 0;
        if (hasWork) {
            activePhRows.push({
                date: formatDisplayDate(phDates[i]),
                tests: phDaily.pruebas_rocha[i],
                valv: phDaily.horas_valvulas[i],
                paro: phDaily.horas_paro_mmto[i],
                cap: phDaily.capacitacion[i],
                estandar: phDaily.tiempo_estandar[i],
                prodTime: phDaily.tiempo_productivo[i],
                prod: phDaily.productividad[i]
            });
        }
    }
    
    // Take ONLY the last 10 rows to fit screen height perfectly
    const visiblePhRows = activePhRows.slice(-10);
    visiblePhRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${row.date}</strong></td>
            <td>${row.tests}</td>
            <td>${row.valv}</td>
            <td>${row.paro}</td>
            <td>${row.cap}</td>
            <td>${row.estandar.toFixed(2)}</td>
            <td>${row.prodTime.toFixed(2)}</td>
            <td class="cell-percent" style="color: ${getPercentColor(row.prod)}">${formatPercent(row.prod)}</td>
        `;
        tbodyPH.appendChild(tr);
    });
}

// ==========================================================================
// CHART JS RENDER LOGIC
// ==========================================================================
function initOrUpdateCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
    
    // Destroy previous charts
    Object.keys(charts).forEach(key => {
        if (charts[key]) {
            charts[key].destroy();
        }
    });
    
    const cilActiveIndices = [];
    appData.cilindros.dates.forEach((d, idx) => {
        if (appData.cilindros.daily_times.tiempo_trabajo[idx] > 0) cilActiveIndices.push(idx);
    });
    
    const phActiveIndices = [];
    appData.ph.dates.forEach((d, idx) => {
        if (appData.ph.daily.tiempo_dia[idx] > 0) phActiveIndices.push(idx);
    });
    
    // Create subset of max last 15 active days for cleaner charting
    const maxChartDays = 15;
    const cilChartIndices = cilActiveIndices.slice(-maxChartDays);
    const phChartIndices = phActiveIndices.slice(-maxChartDays);
    
    // Combine labels for unified chart (last 15 days of activity)
    const unionLabels = [];
    for (let i = 1; i <= 31; i++) {
        if (cilChartIndices.includes(i-1) || phChartIndices.includes(i-1)) {
            unionLabels.push(`Día ${i}`);
        }
    }
    
    if (unionLabels.length === 0) {
        for (let i = 1; i <= 10; i++) unionLabels.push(`Día ${i}`);
    }
    
    const unionCilProd = unionLabels.map(lbl => {
        const dayNum = parseInt(lbl.split(' ')[1]) - 1;
        return appData.cilindros.daily_times.tiempo_trabajo[dayNum] > 0 
            ? appData.cilindros.daily_times.productividad[dayNum] * 100 
            : null;
    });
    const unionPhProd = unionLabels.map(lbl => {
        const dayNum = parseInt(lbl.split(' ')[1]) - 1;
        return appData.ph.daily.tiempo_dia[dayNum] > 0 
            ? appData.ph.daily.productividad[dayNum] * 100 
            : null;
    });

    // 1. Chart Vista General: Line Chart
    const ctxOverview = document.getElementById('overviewChart').getContext('2d');
    const gradBlue = createGradient(ctxOverview, 'rgba(59, 130, 246, 0.15)', 'rgba(59, 130, 246, 0.0)');
    const gradPurp = createGradient(ctxOverview, 'rgba(139, 92, 246, 0.15)', 'rgba(139, 92, 246, 0.0)');
    
    charts.overview = new Chart(ctxOverview, {
        type: 'line',
        data: {
            labels: unionLabels,
            datasets: [
                {
                    label: 'Cilindros (%)',
                    data: unionCilProd,
                    borderColor: '#3b82f6',
                    backgroundColor: gradBlue,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    spanGaps: true,
                    pointBackgroundColor: '#3b82f6',
                    pointRadius: 3
                },
                {
                    label: 'Pruebas PH (%)',
                    data: unionPhProd,
                    borderColor: '#8b5cf6',
                    backgroundColor: gradPurp,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    spanGaps: true,
                    pointBackgroundColor: '#8b5cf6',
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { callback: value => `${value}%`, font: { size: 9 } },
                    min: 0
                },
                x: { grid: { display: false }, ticks: { font: { size: 9 } } }
            }
        }
    });

    // 2. Chart Cilindros distribution doughnut chart
    const ctxCilDist = document.getElementById('cilDistributionChart').getContext('2d');
    const totalActs = {
        'Valvulado': sumArray(appData.cilindros.activities.valvulado),
        'Devalvulado': sumArray(appData.cilindros.activities.devalvulado),
        'Cambio de Válvula': sumArray(appData.cilindros.activities.cambios_valvula)
    };
    
    charts.cilDist = new Chart(ctxCilDist, {
        type: 'doughnut',
        data: {
            labels: Object.keys(totalActs),
            datasets: [{
                data: Object.values(totalActs),
                backgroundColor: [
                    '#3b82f6', '#06b6d4', '#0d9488', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'
                ],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 6, padding: 6, font: { size: 9 } }
                }
            },
            cutout: '65%'
        }
    });

    // 3. Chart PH Performance: tests vs meta bar/line
    const ctxPhPerf = document.getElementById('phPerformanceChart').getContext('2d');
    const phTargetRate = phChartIndices.map(() => 10.0);
    const actualRates = phChartIndices.map(idx => {
        const tests = appData.ph.daily.pruebas_rocha[idx];
        const hrs = appData.ph.daily.tiempo_productivo[idx];
        return hrs > 0 ? parseFloat((tests / hrs).toFixed(2)) : 0.0;
    });
    
    charts.phPerf = new Chart(ctxPhPerf, {
        type: 'bar',
        data: {
            labels: phChartIndices.map(idx => `Día ${idx + 1}`),
            datasets: [
                {
                    label: 'Tasa Registrada (PH/hr)',
                    data: actualRates,
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                    borderRadius: 3,
                    order: 2
                },
                {
                    label: 'Meta (10/hr)',
                    data: phTargetRate,
                    borderColor: '#f59e0b',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointStyle: 'none',
                    fill: false,
                    type: 'line',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 8, font: { size: 9 } } }
            },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { font: { size: 9 } }, min: 0 },
                x: { grid: { display: false }, ticks: { font: { size: 9 } } }
            }
        }
    });

    // 3.b Chart Valve Performance: tests vs meta bar/line
    const ctxValvPerf = document.getElementById('valvPerformanceChart').getContext('2d');
    const valvTargetRate = phChartIndices.map(() => {
        const prom = appData.cilindros.summary.rocha_tiempo_prom_valvulas;
        return prom > 0 ? parseFloat((60 / prom).toFixed(1)) : 21.4;
    });
    const actualValvRates = phChartIndices.map(idx => {
        const valvChanges = appData.cilindros.activities.cambios_valvula[idx];
        const hrs = appData.ph.daily.horas_valvulas[idx];
        return hrs > 0 ? parseFloat((valvChanges / hrs).toFixed(2)) : 0.0;
    });

    charts.valvPerf = new Chart(ctxValvPerf, {
        type: 'bar',
        data: {
            labels: phChartIndices.map(idx => `Día ${idx + 1}`),
            datasets: [
                {
                    label: 'Tasa Registrada (Valv/hr)',
                    data: actualValvRates,
                    backgroundColor: 'rgba(249, 115, 22, 0.7)', // Orange
                    borderRadius: 3,
                    order: 2
                },
                {
                    label: 'Meta (21.4/hr)',
                    data: valvTargetRate,
                    borderColor: '#3b82f6', // Blue
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointStyle: 'none',
                    fill: false,
                    type: 'line',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 8, font: { size: 9 } } }
            },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { font: { size: 9 } }, min: 0 },
                x: { grid: { display: false }, ticks: { font: { size: 9 } } }
            }
        }
    });

    // 4. Chart Cilindros Daily details (Bar and Line combo)
    const ctxCilDaily = document.getElementById('cilDailyChart').getContext('2d');
    charts.cilDaily = new Chart(ctxCilDaily, {
        type: 'bar',
        data: {
            labels: cilChartIndices.map(idx => `Día ${idx + 1}`),
            datasets: [
                {
                    label: 'T. Perdido (hrs)',
                    data: cilChartIndices.map(idx => appData.cilindros.daily_times.tiempo_perdido[idx]),
                    backgroundColor: 'rgba(239, 68, 68, 0.3)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 3,
                    yAxisID: 'y1'
                },
                {
                    label: 'Productividad (%)',
                    data: cilChartIndices.map(idx => appData.cilindros.daily_times.productividad[idx] * 100),
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    pointBackgroundColor: '#3b82f6',
                    pointRadius: 2,
                    tension: 0.4,
                    type: 'line',
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 10, font: { size: 9 } } }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { callback: value => `${value}%`, font: { size: 9 } },
                    min: 0,
                    max: 150
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { callback: value => `${value} hr`, font: { size: 9 } },
                    min: 0
                },
                x: { grid: { display: false }, ticks: { font: { size: 9 } } }
            }
        }
    });

    // 5. Chart PH Daily Details (bar chart)
    const ctxPhDaily = document.getElementById('phDailyChart').getContext('2d');
    const gradPurpBar = createGradient(ctxPhDaily, 'rgba(139, 92, 246, 0.75)', 'rgba(139, 92, 246, 0.25)');
    charts.phDaily = new Chart(ctxPhDaily, {
        type: 'bar',
        data: {
            labels: phChartIndices.map(idx => `Día ${idx + 1}`),
            datasets: [
                {
                    label: 'Pruebas PH',
                    data: phChartIndices.map(idx => appData.ph.daily.pruebas_rocha[idx]),
                    backgroundColor: gradPurpBar,
                    borderColor: '#c084fc',
                    borderWidth: 1,
                    borderRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { font: { size: 9 }, callback: value => `${value} u` }
                },
                x: { grid: { display: false }, ticks: { font: { size: 9 } } }
            }
        }
    });
}

// ==========================================================================
// GOOGLE SHEETS INTEGRATION (CSV FETCH & PARSE)
// ==========================================================================
async function fetchFromGoogleSheets(urlCil, urlPh) {
    const csvUrlCil = cleanGoogleSheetUrl(urlCil);
    const csvUrlPh = cleanGoogleSheetUrl(urlPh);
    
    const [resCil, resPh] = await Promise.all([
        fetch(csvUrlCil).then(r => {
            if (!r.ok) throw new Error('Falló conexión con hoja de Cilindros');
            return r.text();
        }),
        fetch(csvUrlPh).then(r => {
            if (!r.ok) throw new Error('Falló conexión con hoja de PH');
            return r.text();
        })
    ]);
    
    const matrixCil = parseCSV(resCil);
    const matrixPh = parseCSV(resPh);
    
    return parseSheetsData(matrixCil, matrixPh);
}

function cleanGoogleSheetUrl(url) {
    if (url.includes('docs.google.com/spreadsheets')) {
        if (!url.includes('output=csv')) {
            const baseUrl = url.split('/pub')[0];
            const gidMatch = url.match(/gid=(\d+)/);
            const gid = gidMatch ? `&gid=${gidMatch[1]}` : '';
            return `${baseUrl}/pub?output=csv${gid}`;
        }
    }
    return url;
}

function parseCSV(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i+1];
        
        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') {
                i++;
            }
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== "") {
        lines.push(row);
    }
    return lines;
}

function parseSheetsData(matrixCil, matrixPh) {
    const parseNum = (val) => {
        if (!val) return 0.0;
        const clean = val.replace('%', '').trim();
        if (isNaN(clean) || clean === '') return 0.0;
        const num = parseFloat(clean);
        return val.includes('%') ? num / 100.0 : num;
    };
    
    const getCleanDate = (val) => {
        if (!val) return '';
        if (/^\d+$/.test(val)) {
            const serial = parseInt(val);
            const date = new Date(1899, 11, 30);
            date.setDate(date.getDate() + serial);
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
        return val;
    };

    // process Cilindros (Row indices adjusted: Excel COM - 1)
    const cilDates = [];
    const cilColsCount = matrixCil[3].length;
    for (let c = 2; c <= 32; c++) {
        if (c < cilColsCount) cilDates.push(getCleanDate(matrixCil[3][c]));
    }
    
    const activities = {
        "cambios_valvula": [], "devalvulado": [], "valvulado": [], "pulido": [],
        "cambio_disco": [], "revision_interna": [], "capacitacion": [], "lavado_contaminados": []
    };
    
    const cilDailyTimes = {
        "tiempo_devalvular": [], "tiempo_valvular": [], "tiempo_cambios_valvula": [],
        "tiempo_pulido": [], "tiempo_cambio_disco": [], "tiempo_estandar_total": [],
        "tiempo_trabajo": [], "tiempo_total": [], "productividad": [], "tiempo_perdido": []
    };

    const actRows = [
        ["cambios_valvula", 4], ["devalvulado", 5], ["valvulado", 6], ["pulido", 7],
        ["cambio_disco", 8], ["revision_interna", 9], ["capacitacion", 10], ["lavado_contaminados", 11]
    ];
    actRows.forEach(([key, rowIdx]) => {
        for (let c = 2; c <= 32; c++) {
            activities[key].push(c < matrixCil[rowIdx].length ? parseNum(matrixCil[rowIdx][c]) : 0.0);
        }
    });

    const timeRows = [
        ["tiempo_devalvular", 14], ["tiempo_valvular", 15], ["tiempo_cambios_valvula", 16],
        ["tiempo_pulido", 17], ["tiempo_cambio_disco", 18], ["tiempo_estandar_total", 21],
        ["tiempo_trabajo", 23], ["tiempo_total", 24], ["productividad", 25], ["tiempo_perdido", 27]
    ];
    timeRows.forEach(([key, rowIdx]) => {
        for (let c = 2; c <= 32; c++) {
            cilDailyTimes[key].push(c < matrixCil[rowIdx].length ? parseNum(matrixCil[rowIdx][c]) : 0.0);
        }
    });

    const cilSummary = {
        "prod_mensual_1": parseNum(matrixCil[25][33]),
        "prod_mensual_2": parseNum(matrixCil[25][34]),
        "prod_nota": matrixCil[25][36] || '',
        "objetivo_devalvulados": parseNum(matrixCil[26][33]),
        "prom_horas_perdidas": parseNum(matrixCil[27][33]),
        "total_horas_perdidas": parseNum(matrixCil[28][33]),
        "total_dias_perdidos": parseNum(matrixCil[29][33]),
        "rocha_cil_trabajados": parseNum(matrixCil[31][10]),
        "rocha_tiempo_ph": parseNum(matrixCil[32][10]),
        "rocha_tiempo_prom_valvulas": parseNum(matrixCil[33][10]),
        "rocha_ph_equiv": parseNum(matrixCil[34][10])
    };

    // process PH
    const phDates = [];
    const phColsCount = matrixPh[2].length;
    for (let c = 1; c <= 31; c++) {
        if (c < phColsCount) phDates.push(getCleanDate(matrixPh[2][c]));
    }

    const phDaily = {
        "pruebas_rocha": [], "horas_valvulas": [], "horas_paro_mmto": [], "capacitacion": [],
        "tiempo_estandar": [], "tiempo_dia": [], "tiempo_productivo": [], "productividad": [],
        "tiempo_ph_activa": []
    };

    const phRows = [
        ["pruebas_rocha", 3], ["horas_valvulas", 6], ["horas_paro_mmto", 7], ["capacitacion", 8],
        ["tiempo_estandar", 9], ["tiempo_dia", 10], ["tiempo_productivo", 11], ["productividad", 12],
        ["tiempo_ph_activa", 14]
    ];
    phRows.forEach(([key, rowIdx]) => {
        for (let c = 1; c <= 31; c++) {
            phDaily[key].push(c < matrixPh[rowIdx].length ? parseNum(matrixPh[rowIdx][c]) : 0.0);
        }
    });

    const phSummary = {
        "rocha_total_pruebas": parseNum(matrixPh[3][34]),
        "total_horas": parseNum(matrixPh[3][35]),
        "ph_por_hora": parseNum(matrixPh[3][36]),
        "meta_por_hora": parseNum(matrixPh[3][37]),
        "cumplimiento": parseNum(matrixPh[3][38]),
        "comparativa_julio": parseNum(matrixPh[3][41]),
        "comparativa_agosto": parseNum(matrixPh[3][42])
    };

    return {
        "metadata": {
            "fecha_reporte": "Agosto 2026",
            "fecha_actualizacion": new Date().toISOString().replace('T', ' ').substring(0, 19)
        },
        "cilindros": {
            "dates": cilDates,
            "activities": activities,
            "daily_times": cilDailyTimes,
            "summary": cilSummary
        },
        "ph": {
            "dates": phDates,
            "daily": phDaily,
            "summary": phSummary
        }
    };
}

// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================
function formatPercent(val) {
    return `${(val * 100).toFixed(1)}%`;
}

function formatNumber(val) {
    return val.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const str = String(dateStr);
    if (str.includes('-')) {
        const parts = str.split('-');
        return `${parts[2]}/${parts[1]}`;
    }
    return str;
}

function getPercentColor(val) {
    if (val >= 1.0) return 'var(--color-green-light)';
    if (val >= 0.8) return 'var(--text-primary)';
    if (val >= 0.5) return 'var(--color-orange-light)';
    return 'var(--color-red)';
}

function sumArray(arr) {
    return arr.reduce((acc, val) => acc + (val || 0), 0);
}

function createGradient(ctx, colorStart, colorEnd) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, colorStart);
    gradient.addColorStop(1, colorEnd);
    return gradient;
}

function showToast(message, type = 'success', title = 'Sincronización') {
    const toast = document.getElementById('notification-toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastTitle = document.getElementById('toast-title');
    const toastMsg = document.getElementById('toast-message');
    
    toastTitle.innerText = title;
    toastMsg.innerText = message;
    
    if (type === 'success') {
        toastIcon.className = 'fa-solid fa-circle-check toast-icon';
        toastIcon.style.animation = 'none';
    } else if (type === 'error') {
        toastIcon.className = 'fa-solid fa-circle-xmark toast-icon error';
        toastIcon.style.animation = 'none';
    } else if (type === 'syncing') {
        toastIcon.className = 'fa-solid fa-arrows-rotate toast-icon syncing';
    }
    
    toast.classList.add('show');
    
    if (type !== 'syncing') {
        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }
}
