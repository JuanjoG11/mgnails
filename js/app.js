/**
 * Main Application Logic – MG Nails Paris
 */

const App = {

    // ─── INIT ─────────────────────────────────────────────────────────────────

    init: async () => {
        document.getElementById('current-date').textContent = Utils.getCurrentDate();
        App.setupNavigation();

        try {
            await App.renderDashboard();
        } catch (e) {
            console.error('Render error:', e);
        }

        // ── Realtime subscriptions ──
        supabaseClient
            .channel('db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, async () => {
                const activeView = document.querySelector('.view.active')?.id;
                if (activeView === 'view-dashboard') await App.renderDashboard();
                if (activeView === 'view-agenda')    await App.renderAgenda();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, async () => {
                const activeView = document.querySelector('.view.active')?.id;
                if (activeView === 'view-services') await App.renderServices();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_movements' }, async () => {
                const activeView = document.querySelector('.view.active')?.id;
                if (activeView === 'view-dashboard') await App.renderDashboard();
                if (activeView === 'view-finance')   await App.renderFinance();
            })
            .subscribe();
    },

    // ─── NAVIGATION ───────────────────────────────────────────────────────────

    setupNavigation: () => {
        document.querySelectorAll('.nav-links li[data-view]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = link.getAttribute('data-view');
                App.updateActiveNav(viewName);
                App.switchView(viewName);
            });
        });

        document.querySelectorAll('.bottom-nav .nav-item[data-view]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = link.getAttribute('data-view');
                App.updateActiveNav(viewName);
                App.switchView(viewName);
            });
        });
    },

    updateActiveNav: (viewName) => {
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        document.querySelector(`.nav-links li[data-view="${viewName}"]`)?.classList.add('active');

        document.querySelectorAll('.bottom-nav .nav-item').forEach(l => l.classList.remove('active'));
        document.querySelector(`.bottom-nav .nav-item[data-view="${viewName}"]`)?.classList.add('active');
    },

    switchView: async (viewName) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`view-${viewName}`);
        if (!target) return;
        target.classList.add('active');

        const titleMap = {
            dashboard: 'Panel Principal',
            agenda:    'Agenda',
            services:  'Servicios',
            finance:   'Finanzas'
        };
        document.getElementById('page-title').textContent = titleMap[viewName] || '';

        if (viewName === 'dashboard') await App.renderDashboard();
        if (viewName === 'agenda')    await App.renderAgenda();
        if (viewName === 'services')  await App.renderServices();
        if (viewName === 'finance')   await App.renderFinance();
    },

    // ─── DASHBOARD ────────────────────────────────────────────────────────────

    renderDashboard: async () => {
        const today        = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().getMonth();
        const currentYear  = new Date().getFullYear();

        const [allAppointments, todayMovements] = await Promise.all([
            Store.getAppointments(),
            Store.getCashMovements(today)
        ]);

        // ── Stat cards ──
        const daily   = Store.getDailyTotal(today, allAppointments);
        const monthly = Store.getMonthlyTotal(currentMonth, currentYear, allAppointments);
        const { net } = Store.getCashTotals(todayMovements);

        document.getElementById('daily-total').textContent    = Utils.formatCurrency(daily);
        document.getElementById('monthly-total').textContent  = Utils.formatCurrency(monthly);
        document.getElementById('cash-box-today').textContent = Utils.formatCurrency(net);

        // ── Upcoming today ──
        const todaysAppointments = allAppointments.filter(a => a.date === today && a.status === 'pending');
        document.getElementById('appointments-today').textContent = todaysAppointments.length;

        const list = document.getElementById('upcoming-appointments');
        list.innerHTML = '';
        if (todaysAppointments.length === 0) {
            list.innerHTML = '<li class="empty-state">No hay citas para hoy</li>';
        } else {
            todaysAppointments.forEach(appt => {
                const li = document.createElement('li');
                li.className = 'appointment-item';
                li.innerHTML = `
                    <div class="time-slot">${appt.time}</div>
                    <div class="client-info">
                        <strong>${appt.client}</strong>
                        <span>${appt.service_name}</span>
                    </div>
                    <span class="status-badge status-pending">Pendiente</span>
                `;
                list.appendChild(li);
            });
        }

        // ── Chart ──
        App.renderChart(allAppointments);

        // ── Cash box section ──
        App.renderCashBox(todayMovements, today);
    },

    renderChart: (appointments = []) => {
        const ctx = document.getElementById('dashboardChart');
        if (!ctx) return;
        if (window.myChart) window.myChart.destroy();

        const labels = [], data = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            labels.push(d.toLocaleDateString('es-ES', { weekday: 'short' }));
            data.push(Store.getDailyTotal(dateStr, appointments));
        }

        window.myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Ingresos (€)',
                    data,
                    backgroundColor: 'rgba(255, 133, 161, 0.4)',
                    borderColor:     'rgba(255, 26, 107, 1)',
                    borderWidth: 2,
                    borderRadius: 12,
                    hoverBackgroundColor: 'rgba(255, 26, 107, 0.6)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    // ─── CASH BOX (CIERRE DE CAJA) ────────────────────────────────────────────

    renderCashBox: (movements, dateString) => {
        const container = document.getElementById('cash-box-section');
        if (!container) return;

        const cashIns     = movements.filter(m => m.type === 'cash_in');
        const transferIns = movements.filter(m => m.type === 'transfer_in');
        const expenses    = movements.filter(m => m.type === 'expense');
        const { cashIn, transferIn, expenses: expTotal, net } = Store.getCashTotals(movements);

        const renderList = (items, type) => {
            if (items.length === 0) return '<p class="cashbox-empty">Sin movimientos</p>';
            return items.map(m => `
                <div class="cashbox-item">
                    <span class="cashbox-desc">${m.description}</span>
                    <span class="cashbox-amount">${Utils.formatCurrency(m.amount)}</span>
                    <button class="cashbox-del" onclick="App.deleteCashMovement('${m.id}', '${dateString}')" title="Eliminar">×</button>
                </div>
            `).join('');
        };

        container.innerHTML = `
            <div class="cashbox-header">
                <h3>💰 Cierre de Caja</h3>
                <span class="cashbox-date">${Utils.formatDate(dateString)}</span>
            </div>

            <div class="cashbox-grid">
                <!-- Efectivo -->
                <div class="cashbox-col cashbox-cash">
                    <div class="cashbox-col-header">
                        <span class="cashbox-col-title">💵 Efectivo</span>
                        <span class="cashbox-col-total">${Utils.formatCurrency(cashIn)}</span>
                    </div>
                    <div class="cashbox-list">${renderList(cashIns, 'cash_in')}</div>
                    <button class="cashbox-add-btn cashbox-add-cash" onclick="App.openCashMovementModal('cash_in', '${dateString}')">
                        + Agregar Efectivo
                    </button>
                </div>

                <!-- Transferencia -->
                <div class="cashbox-col cashbox-transfer">
                    <div class="cashbox-col-header">
                        <span class="cashbox-col-title">🏦 Transferencia</span>
                        <span class="cashbox-col-total">${Utils.formatCurrency(transferIn)}</span>
                    </div>
                    <div class="cashbox-list">${renderList(transferIns, 'transfer_in')}</div>
                    <button class="cashbox-add-btn cashbox-add-transfer" onclick="App.openCashMovementModal('transfer_in', '${dateString}')">
                        + Agregar Transferencia
                    </button>
                </div>

                <!-- Egresos -->
                <div class="cashbox-col cashbox-expense">
                    <div class="cashbox-col-header">
                        <span class="cashbox-col-title">📤 Egresos</span>
                        <span class="cashbox-col-total">${Utils.formatCurrency(expTotal)}</span>
                    </div>
                    <div class="cashbox-list">${renderList(expenses, 'expense')}</div>
                    <button class="cashbox-add-btn cashbox-add-expense" onclick="App.openCashMovementModal('expense', '${dateString}')">
                        + Agregar Egreso
                    </button>
                </div>
            </div>

            <!-- Resumen Final -->
            <div class="cashbox-summary">
                <div class="cashbox-summary-row">
                    <span>💵 Total Efectivo</span>
                    <span class="txt-green">${Utils.formatCurrency(cashIn)}</span>
                </div>
                <div class="cashbox-summary-row">
                    <span>🏦 Total Transferencias</span>
                    <span class="txt-blue">${Utils.formatCurrency(transferIn)}</span>
                </div>
                <div class="cashbox-summary-row">
                    <span>📤 Total Egresos</span>
                    <span class="txt-red">- ${Utils.formatCurrency(expTotal)}</span>
                </div>
                <div class="cashbox-summary-divider"></div>
                <div class="cashbox-summary-net">
                    <span>🏧 Caja Final</span>
                    <span class="${net >= 0 ? 'txt-green' : 'txt-red'}">${Utils.formatCurrency(net)}</span>
                </div>
            </div>
        `;
    },

    openCashMovementModal: (type, dateString) => {
        const labels = {
            cash_in:     { title: 'Ingreso en Efectivo',    placeholder: 'Ej: Manicura cliente Ana', color: '#27ae60' },
            transfer_in: { title: 'Ingreso por Transferencia', placeholder: 'Ej: Pago Bizum María',  color: '#2980b9' },
            expense:     { title: 'Egreso / Gasto',         placeholder: 'Ej: Compra de gel UV',    color: '#e74c3c' }
        };
        const cfg = labels[type];

        const modalHtml = `
            <div class="modal-overlay" id="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 style="color:${cfg.color}">${cfg.title}</h3>
                        <button class="close-modal" onclick="App.closeModal()">&times;</button>
                    </div>
                    <form onsubmit="App.handleSaveCashMovement(event, '${type}', '${dateString}')">
                        <div class="form-group">
                            <label>Descripción</label>
                            <input type="text" name="description" required placeholder="${cfg.placeholder}">
                        </div>
                        <div class="form-group">
                            <label>Monto (€)</label>
                            <input type="number" name="amount" required step="0.01" min="0.01" placeholder="0,00">
                        </div>
                        <button type="submit" class="btn-primary" style="width:100%; background:linear-gradient(135deg,${cfg.color},${cfg.color}cc)">
                            Guardar
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
    },

    handleSaveCashMovement: async (e, type, dateString) => {
        e.preventDefault();
        const formData    = new FormData(e.target);
        const description = formData.get('description').trim();
        const amount      = parseFloat(formData.get('amount'));

        await Store.addCashMovement({ type, description, amount, date: dateString });
        App.closeModal();

        // Re-fetch and re-render cash box
        const movements = await Store.getCashMovements(dateString);
        App.renderCashBox(movements, dateString);

        // Update stat card
        const { net } = Store.getCashTotals(movements);
        const el = document.getElementById('cash-box-today');
        if (el) el.textContent = Utils.formatCurrency(net);
    },

    deleteCashMovement: async (id, dateString) => {
        if (!confirm('¿Eliminar este movimiento?')) return;
        await Store.deleteCashMovement(id);
        const movements = await Store.getCashMovements(dateString);
        App.renderCashBox(movements, dateString);
        const { net } = Store.getCashTotals(movements);
        const el = document.getElementById('cash-box-today');
        if (el) el.textContent = Utils.formatCurrency(net);
    },

    // ─── SERVICES ─────────────────────────────────────────────────────────────

    renderServices: async () => {
        const container = document.getElementById('view-services');
        const services  = await Store.getServices();

        let html = `
            <div style="display:flex; justify-content:flex-end; margin-bottom:1rem;">
                <button class="btn-primary" onclick="App.openAddServiceModal()">
                    <i class='bx bx-plus'></i> Nuevo Servicio
                </button>
            </div>
            <div class="stats-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
        `;

        if (services.length === 0) {
            html += '<div class="empty-state">No hay servicios registrados.</div>';
        } else {
            services.forEach(service => {
                html += `
                    <div class="stat-card" style="display:block;">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1rem;">
                            <div class="icon" style="width:40px; height:40px; margin:0;"><i class='bx bxs-spa'></i></div>
                            <h2 style="color:var(--text-dark); font-family:'Playfair Display', serif;">${Utils.formatCurrency(service.price)}</h2>
                        </div>
                        <h3 style="font-size:1.1rem; color:var(--text-dark); margin-bottom:0.5rem;">${service.name}</h3>
                        <button onclick="App.deleteService('${service.id}')" style="color:red; background:none; border:none; cursor:pointer; font-size:0.9rem;">Eliminar</button>
                    </div>
                `;
            });
        }

        html += '</div>';
        container.innerHTML = html;
    },

    openAddServiceModal: () => {
        document.getElementById('modal-container').innerHTML = `
            <div class="modal-overlay" id="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Nuevo Servicio</h3>
                        <button class="close-modal" onclick="App.closeModal()">&times;</button>
                    </div>
                    <form onsubmit="App.handleSaveService(event)">
                        <div class="form-group">
                            <label>Nombre del Servicio</label>
                            <input type="text" name="name" required placeholder="Ej: Manicura Rusa">
                        </div>
                        <div class="form-group">
                            <label>Precio (€)</label>
                            <input type="number" name="price" required step="0.01" placeholder="Ej: 25.00">
                        </div>
                        <button type="submit" class="btn-primary" style="width:100%">Guardar</button>
                    </form>
                </div>
            </div>
        `;
    },

    handleSaveService: async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        await Store.addService({
            name:  formData.get('name'),
            price: parseFloat(formData.get('price'))
        });
        App.closeModal();
        await App.renderServices();
    },

    deleteService: async (id) => {
        if (confirm('¿Seguro que quieres eliminar este servicio?')) {
            await Store.deleteService(id);
            await App.renderServices();
        }
    },

    // ─── AGENDA ───────────────────────────────────────────────────────────────

    renderAgenda: async () => {
        const container       = document.getElementById('view-agenda');
        const allAppointments = await Store.getAppointments();

        const pending = allAppointments
            .filter(a => a.status === 'pending')
            .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

        const history = allAppointments
            .filter(a => a.status !== 'pending')
            .sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));

        let html = `
            <div class="agenda-header" style="display:flex; justify-content:space-between; margin-bottom:1rem; align-items:center;">
                <h3>Próximas Citas</h3>
                <button class="btn-primary" onclick="App.openAddAppointmentModal()">
                    <i class='bx bx-calendar-plus'></i> Agendar Cita
                </button>
            </div>
            <div class="recent-activity">
                <ul class="appointments-list">
        `;

        if (pending.length === 0) {
            html += '<li class="empty-state">No hay citas pendientes.</li>';
        } else {
            pending.forEach(appt => {
                html += `
                    <li class="appointment-item">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <div class="time-slot" style="text-align:center;">
                                <div style="font-size:0.8rem; color:var(--text-light);">${appt.date}</div>
                                <div style="font-size:1.1rem;">${appt.time}</div>
                            </div>
                            <div class="client-info">
                                <strong>${appt.client}</strong>
                                <span>${appt.service_name} - ${Utils.formatCurrency(appt.price)}</span>
                            </div>
                        </div>
                        <div style="display:flex; gap:0.8rem; align-items:center;">
                            <span class="status-badge status-pending">Pendiente</span>
                            <button onclick="App.completeAppointment('${appt.id}')" class="btn-action btn-complete" title="Finalizar Cita"><i class='bx bx-check'></i> Finalizar</button>
                            <button onclick="App.deleteAppointment('${appt.id}')" class="btn-action btn-delete" title="Eliminar"><i class='bx bx-trash'></i></button>
                        </div>
                    </li>
                `;
            });
        }
        html += '</ul></div>';

        html += `
            <div class="agenda-header" style="margin-top:3rem; margin-bottom:1rem;">
                <h3>Historial de Citas</h3>
            </div>
            <div class="recent-activity">
                <ul class="appointments-list">
        `;

        if (history.length === 0) {
            html += '<li class="empty-state">No hay historial disponible.</li>';
        } else {
            history.forEach(appt => {
                html += `
                    <li class="appointment-item" style="opacity:0.8;">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <div class="time-slot" style="text-align:center; filter:grayscale(1);">
                                <div style="font-size:0.8rem; color:var(--text-light);">${appt.date}</div>
                                <div style="font-size:1.1rem;">${appt.time}</div>
                            </div>
                            <div class="client-info">
                                <strong>${appt.client}</strong>
                                <span>${appt.service_name}</span>
                            </div>
                        </div>
                        <div style="display:flex; gap:0.8rem; align-items:center;">
                            <span class="status-badge status-${appt.status}">${appt.status === 'completed' ? 'Completada' : 'Cancelada'}</span>
                            <button onclick="App.deleteAppointment('${appt.id}')" class="btn-action btn-delete" style="padding:0.6rem;" title="Eliminar del historial"><i class='bx bx-trash'></i></button>
                        </div>
                    </li>
                `;
            });
        }
        html += '</ul></div>';

        container.innerHTML = html;
    },

    openAddAppointmentModal: async () => {
        const services = await Store.getServices();
        const serviceOptions = services.map(s =>
            `<option value="${s.id}" data-price="${s.price}" data-name="${s.name}">${s.name} (${Utils.formatCurrency(s.price)})</option>`
        ).join('');

        document.getElementById('modal-container').innerHTML = `
            <div class="modal-overlay" id="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Nueva Cita</h3>
                        <button class="close-modal" onclick="App.closeModal()">&times;</button>
                    </div>
                    <form onsubmit="App.handleSaveAppointment(event)">
                        <div class="form-group">
                            <label>Nombre del Cliente</label>
                            <input type="text" name="client" required placeholder="Nombre completo">
                        </div>
                        <div class="form-group">
                            <label>Teléfono <span style="color:var(--text-light); font-size:0.85em;">(opcional – cualquier país)</span></label>
                            <input type="tel" name="phone" placeholder="+34 600 000 000  /  +33 6 00 00 00 00">
                        </div>
                        <div class="form-group">
                            <label>Servicio</label>
                            <select name="serviceId" required onchange="App.updateServicePrice(this)">
                                <option value="">Seleccionar Servicio</option>
                                ${serviceOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Fecha</label>
                            <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label>Hora</label>
                            <input type="time" name="time" required>
                        </div>
                        <input type="hidden" name="serviceName" id="hidden-service-name">
                        <input type="hidden" name="price"       id="hidden-price">
                        <button type="submit" class="btn-primary" style="width:100%">
                            <i class='bx bx-calendar-check'></i> Agendar
                        </button>
                    </form>
                </div>
            </div>
        `;
    },

    updateServicePrice: (select) => {
        const opt = select.options[select.selectedIndex];
        document.getElementById('hidden-service-name').value = opt.getAttribute('data-name') || '';
        document.getElementById('hidden-price').value        = opt.getAttribute('data-price') || '';
    },

    handleSaveAppointment: async (e) => {
        e.preventDefault();
        const formData    = new FormData(e.target);
        const client      = formData.get('client').trim();
        const phone       = formData.get('phone').trim();
        const serviceId   = formData.get('serviceId');
        const serviceName = formData.get('serviceName');
        const price       = parseFloat(formData.get('price'));
        const date        = formData.get('date');
        const time        = formData.get('time');

        const saved = await Store.addAppointment({
            client, phone, serviceId, serviceName, price, date, time, status: 'pending'
        });

        App.closeModal();

        if (saved) {
            App.openReminderModal({ ...saved, serviceName: saved.service_name });
        }

        await App.renderAgenda();
    },

    completeAppointment: async (id) => {
        if (confirm('¿Marcar cita como completada? Esto sumará al total del día.')) {
            await Store.updateAppointmentStatus(id, 'completed');
            await App.renderAgenda();
        }
    },

    deleteAppointment: async (id) => {
        if (confirm('¿Eliminar cita?')) {
            await Store.deleteAppointment(id);
            await App.renderAgenda();
        }
    },

    // ─── REMINDER MODAL (WhatsApp + Canvas) ──────────────────────────────────

    openReminderModal: (appointment) => {
        const container = document.getElementById('modal-container');

        // Build the canvas card
        const canvas = Utils.drawReminderCard(appointment);
        canvas.id    = 'reminder-canvas';

        const dateFormatted = Utils.capitalize(Utils.formatDate(appointment.date));
        const phone         = appointment.phone || '';
        const cleanPhone    = Utils.cleanPhone(phone);

        const timeClean = appointment.time.slice(0, 5);
        const waText = encodeURIComponent(
            `*MG Nails Paris*\n\n` +
            `Hola ${Utils.capitalize(appointment.client)}, tu cita esta confirmada.\n\n` +
            `*Servicio:* ${appointment.serviceName || appointment.service_name}\n` +
            `*Fecha:* ${dateFormatted}\n` +
            `*Hora:* ${timeClean}\n` +
            `*Precio:* ${Utils.formatCurrency(appointment.price)}\n\n` +
            `Te esperamos.`
        );

        const whatsappSection = cleanPhone
            ? `<a href="https://wa.me/${cleanPhone}?text=${waText}" target="_blank" class="btn-primary reminder-btn btn-wa">
                   💬 Enviar por WhatsApp
               </a>`
            : `<div class="reminder-phone-fallback">
                   <p style="font-size:0.9rem; color:var(--text-light); margin-bottom:0.5rem;">
                       No se guardó teléfono. Ingresa el número para enviar:
                   </p>
                   <div style="display:flex; gap:0.5rem;">
                       <input type="tel" id="fallback-phone" placeholder="+34 600 000 000" style="flex:1;">
                       <button class="btn-primary" style="padding:0.8rem 1rem; white-space:nowrap;"
                               onclick="App.openWhatsAppFallback('${waText}')">
                           💬 Enviar
                       </button>
                   </div>
               </div>`;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id        = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content reminder-modal">
                <div class="modal-header">
                    <h3>✅ Cita Agendada</h3>
                    <button class="close-modal" onclick="App.closeModal()">&times;</button>
                </div>
                <p class="reminder-subtitle">Tarjeta de recordatorio para <strong>${appointment.client}</strong></p>
                <div id="reminder-canvas-wrapper" class="reminder-canvas-wrapper"></div>
                <div class="reminder-actions">
                    <button class="btn-primary reminder-btn btn-download" onclick="App.downloadReminderCard()">
                        📥 Descargar imagen
                    </button>
                    ${whatsappSection}
                </div>
                <button class="btn-close-reminder" onclick="App.closeModal()">Cerrar</button>
            </div>
        `;

        container.innerHTML = '';
        container.appendChild(overlay);

        // Append canvas into wrapper after DOM is ready
        document.getElementById('reminder-canvas-wrapper').appendChild(canvas);
    },

    downloadReminderCard: () => {
        const canvas = document.getElementById('reminder-canvas');
        if (!canvas) return;
        const link    = document.createElement('a');
        link.download = 'cita-mgnails.png';
        link.href     = canvas.toDataURL('image/png');
        link.click();
    },

    openWhatsAppFallback: (waText) => {
        const input = document.getElementById('fallback-phone');
        const clean = Utils.cleanPhone(input?.value || '');
        if (!clean) {
            input.style.borderColor = 'red';
            input.placeholder = 'Ingresa un número válido';
            return;
        }
        window.open(`https://wa.me/${clean}?text=${waText}`, '_blank');
    },

    // ─── FINANCE VIEW ─────────────────────────────────────────────────────────

    _financeMonth: new Date().getMonth(),
    _financeYear:  new Date().getFullYear(),

    renderFinance: async () => {
        const container = document.getElementById('view-finance');
        if (!container) return;

        const month = App._financeMonth;
        const year  = App._financeYear;

        const movements = await Store.getCashMovementsByMonth(month, year);
        const { cashIn, transferIn, expenses, net } = Store.getCashTotals(movements);

        const monthLabel = new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

        // Group by day
        const byDay = {};
        movements.forEach(m => {
            if (!byDay[m.date]) byDay[m.date] = [];
            byDay[m.date].push(m);
        });

        const dayRows = Object.keys(byDay).sort().map(date => {
            const items  = byDay[date];
            const totals = Store.getCashTotals(items);
            const rows   = items.map(m => {
                const cls = m.type === 'cash_in' ? 'txt-green' : m.type === 'transfer_in' ? 'txt-blue' : 'txt-red';
                const sign = m.type === 'expense' ? '-' : '+';
                const icon = m.type === 'cash_in' ? '💵' : m.type === 'transfer_in' ? '🏦' : '📤';
                return `
                    <div class="finance-row">
                        <span class="finance-row-icon">${icon}</span>
                        <span class="finance-row-desc">${m.description}</span>
                        <span class="finance-row-amount ${cls}">${sign}${Utils.formatCurrency(m.amount)}</span>
                    </div>
                `;
            }).join('');

            return `
                <div class="finance-day-block">
                    <div class="finance-day-header">
                        <span class="finance-day-label">${Utils.capitalize(Utils.formatDate(date))}</span>
                        <span class="finance-day-net ${totals.net >= 0 ? 'txt-green' : 'txt-red'}">${Utils.formatCurrency(totals.net)}</span>
                    </div>
                    ${rows}
                </div>
            `;
        }).join('') || '<div class="empty-state">No hay movimientos este mes.</div>';

        container.innerHTML = `
            <div class="finance-header">
                <button class="finance-nav-btn" onclick="App.changeFinanceMonth(-1)">‹</button>
                <h3 class="finance-month-title">${Utils.capitalize(monthLabel)}</h3>
                <button class="finance-nav-btn" onclick="App.changeFinanceMonth(1)">›</button>
            </div>

            <div class="stats-grid finance-summary-grid">
                <div class="stat-card">
                    <div class="icon" style="background:linear-gradient(135deg,#27ae60,#1a8a47)"><i class='bx bx-money'></i></div>
                    <div class="details">
                        <h3>Efectivo</h3>
                        <p class="amount txt-green">${Utils.formatCurrency(cashIn)}</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="icon" style="background:linear-gradient(135deg,#2980b9,#1a5f8a)"><i class='bx bx-transfer'></i></div>
                    <div class="details">
                        <h3>Transferencias</h3>
                        <p class="amount txt-blue">${Utils.formatCurrency(transferIn)}</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="icon" style="background:linear-gradient(135deg,#e74c3c,#c0392b)"><i class='bx bx-trending-down'></i></div>
                    <div class="details">
                        <h3>Egresos</h3>
                        <p class="amount txt-red">${Utils.formatCurrency(expenses)}</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="icon"><i class='bx bx-line-chart'></i></div>
                    <div class="details">
                        <h3>Neto del Mes</h3>
                        <p class="amount ${net >= 0 ? 'txt-green' : 'txt-red'}">${Utils.formatCurrency(net)}</p>
                    </div>
                </div>
            </div>

            <!-- Chart -->
            <div class="chart-container glass-panel" style="margin-bottom:2rem; height:280px;">
                <h3 style="margin-bottom:0.5rem; font-family:'Playfair Display',serif; font-size:1rem;">Ingresos vs Egresos del mes</h3>
                <canvas id="financeChart"></canvas>
            </div>

            <!-- Detail list -->
            <div class="glass-panel" style="padding:1.5rem;">
                <h3 style="margin-bottom:1.5rem; font-family:'Playfair Display',serif;">Detalle por día</h3>
                ${dayRows}
            </div>
        `;

        // Build chart after DOM renders
        App.renderFinanceChart(movements, month, year);
    },

    renderFinanceChart: (movements, month, year) => {
        const ctx = document.getElementById('financeChart');
        if (!ctx) return;
        if (window.financeChart && typeof window.financeChart.destroy === 'function') {
            window.financeChart.destroy();
        }
        window.financeChart = null;

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const labels = [], inData = [], outData = [];

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayMov  = movements.filter(m => m.date === dateStr);
            const tots    = Store.getCashTotals(dayMov);
            labels.push(d);
            inData.push(tots.cashIn + tots.transferIn);
            outData.push(tots.expenses);
        }

        window.financeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label:           'Ingresos (€)',
                        data:            inData,
                        backgroundColor: 'rgba(39, 174, 96, 0.5)',
                        borderColor:     '#27ae60',
                        borderWidth: 2,
                        borderRadius: 6
                    },
                    {
                        label:           'Egresos (€)',
                        data:            outData,
                        backgroundColor: 'rgba(231, 76, 60, 0.5)',
                        borderColor:     '#e74c3c',
                        borderWidth: 2,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { position: 'top' }
                }
            }
        });
    },

    changeFinanceMonth: async (delta) => {
        App._financeMonth += delta;
        if (App._financeMonth > 11) { App._financeMonth = 0;  App._financeYear++; }
        if (App._financeMonth < 0)  { App._financeMonth = 11; App._financeYear--; }
        await App.renderFinance();
    },

    // ─── SHARED HELPERS ───────────────────────────────────────────────────────

    closeModal: () => {
        document.getElementById('modal-container').innerHTML = '';
    }
};

document.addEventListener('DOMContentLoaded', App.init);
