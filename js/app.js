/**
 * Main Application Logic
 */

const App = {
    init: async () => {
        // Update current date
        document.getElementById('current-date').textContent = Utils.getCurrentDate();

        // Setup Navigation
        App.setupNavigation();

        // Initial Render
        try {
            await App.renderDashboard();
        } catch (e) {
            console.error('Render error:', e);
        }

        // --- REALTIME SUBSCRIPTION ---
        supabaseClient
            .channel('db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, async () => {
                const activeView = document.querySelector('.view.active').id;
                if (activeView === 'view-dashboard') await App.renderDashboard();
                if (activeView === 'view-agenda') await App.renderAgenda();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, async () => {
                const activeView = document.querySelector('.view.active').id;
                if (activeView === 'view-services') await App.renderServices();
                // If we are in agenda and modal is open, we might need refresh but usually services don't change that often
            })
            .subscribe();
    },

    setupNavigation: () => {
        // Desktop Sidebar
        const sidebarLinks = document.querySelectorAll('.nav-links li');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = link.getAttribute('data-view');
                App.updateActiveNav(viewName);
                App.switchView(viewName);
            });
        });

        // Mobile Bottom Nav
        const mobileLinks = document.querySelectorAll('.bottom-nav .nav-item');
        mobileLinks.forEach(link => {
            if (link.getAttribute('data-view')) { // Skip FAB if it doesn't have data-view
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    // If it's the center button (FAB), it might open modal instead
                    const viewName = link.getAttribute('data-view');
                    if (viewName) {
                        App.updateActiveNav(viewName);
                        App.switchView(viewName);
                    }
                });
            }
        });
    },

    updateActiveNav: (viewName) => {
        // Desktop
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        const activeSidebar = document.querySelector(`.nav-links li[data-view="${viewName}"]`);
        if (activeSidebar) activeSidebar.classList.add('active');

        // Mobile
        document.querySelectorAll('.bottom-nav .nav-item').forEach(l => l.classList.remove('active'));
        const activeMobile = document.querySelector(`.bottom-nav .nav-item[data-view="${viewName}"]`);
        if (activeMobile) activeMobile.classList.add('active');
    },

    switchView: async (viewName) => {
        // Hide all views
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

        // Show target view
        const target = document.getElementById(`view-${viewName}`);
        if (target) {
            target.classList.add('active');

            // Update Header Title
            const titleMap = {
                'dashboard': 'Panel Principal',
                'agenda': 'Agenda',
                'services': 'Servicios'
            };
            document.getElementById('page-title').textContent = titleMap[viewName];

            // Render specific content
            if (viewName === 'dashboard') await App.renderDashboard();
            if (viewName === 'services') App.renderServices();
            if (viewName === 'agenda') await App.renderAgenda();
        }
    },

    // --- DASHBOARD RENDER ---
    // --- DASHBOARD RENDER ---
    renderDashboard: async () => {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        const allAppointments = await Store.getAppointments();

        // Update Stats
        const daily = Store.getDailyTotal(today, allAppointments);
        const monthly = Store.getMonthlyTotal(currentMonth, currentYear, allAppointments);

        document.getElementById('daily-total').textContent = Utils.formatCurrency(daily);
        document.getElementById('monthly-total').textContent = Utils.formatCurrency(monthly);

        // Proximas Citas (Solo las pendientes de hoy)
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
                        <span>${appt.serviceName}</span>
                    </div>
                    <span class="status-badge status-${appt.status}">${appt.status === 'pending' ? 'Pendiente' : (appt.status === 'completed' ? 'Completado' : 'Cancelado')}</span>
                `;
                list.appendChild(li);
            });
        }

        // Render Chart
        App.renderChart(allAppointments);
    },

    renderChart: (appointments = []) => {
        const ctx = document.getElementById('dashboardChart');
        if (!ctx) return;

        // Destroy existing chart if any (to prevent overlap)
        if (window.myChart) window.myChart.destroy();

        // Weekly Data (Last 7 days)
        const labels = [];
        const data = [];

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
                labels: labels,
                datasets: [{
                    label: 'Ingresos (€)',
                    data: data,
                    backgroundColor: 'rgba(255, 133, 161, 0.4)',
                    borderColor: 'rgba(255, 26, 107, 1)',
                    borderWidth: 2,
                    borderRadius: 12,
                    hoverBackgroundColor: 'rgba(255, 26, 107, 0.6)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { display: false }
                    },
                    x: {
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    },

    // --- SERVICES RENDER ---
    renderServices: async () => {
        const container = document.getElementById('view-services');
        const services = await Store.getServices();

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
        const modalHtml = `
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
        document.getElementById('modal-container').innerHTML = modalHtml;
    },

    handleSaveService: async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const name = formData.get('name');
        const price = parseFloat(formData.get('price'));

        await Store.addService({
            name,
            price
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

    // --- AGENDA RENDER ---
    renderAgenda: async () => {
        const container = document.getElementById('view-agenda');
        const allAppointments = await Store.getAppointments();

        // Filter pending
        const pending = allAppointments.filter(a => a.status === 'pending')
            .sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));

        // Filter history (completed/cancelled)
        const history = allAppointments.filter(a => a.status !== 'pending')
            .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));

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
                                <span>${appt.serviceName} - ${Utils.formatCurrency(appt.price)}</span>
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

        // --- HISTORIAL SECTION ---
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
                    <li class="appointment-item" style="opacity: 0.8;">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <div class="time-slot" style="text-align:center; filter: grayscale(1);">
                                <div style="font-size:0.8rem; color:var(--text-light);">${appt.date}</div>
                                <div style="font-size:1.1rem;">${appt.time}</div>
                            </div>
                            <div class="client-info">
                                <strong>${appt.client}</strong>
                                <span>${appt.serviceName}</span>
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
        let serviceOptions = services.map(s => `<option value="${s.id}" data-price="${s.price}" data-name="${s.name}">${s.name} (${Utils.formatCurrency(s.price)})</option>`).join('');

        const modalHtml = `
            <div class="modal-overlay" id="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Nueva Cita</h3>
                        <button class="close-modal" onclick="App.closeModal()">&times;</button>
                    </div>
                    <form onsubmit="App.handleSaveAppointment(event)">
                        <div class="form-group">
                            <label>Nombre del Cliente</label>
                            <input type="text" name="client" required placeholder="Nombre">
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
                        <input type="hidden" name="price" id="hidden-price">
                        <button type="submit" class="btn-primary" style="width:100%">Agendar</button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
    },

    updateServicePrice: (select) => {
        const option = select.options[select.selectedIndex];
        document.getElementById('hidden-service-name').value = option.getAttribute('data-name');
        document.getElementById('hidden-price').value = option.getAttribute('data-price');
    },

    handleSaveAppointment: async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const client = formData.get('client');
        const serviceId = formData.get('serviceId');
        const serviceName = formData.get('serviceName');
        const price = parseFloat(formData.get('price'));
        const date = formData.get('date');
        const time = formData.get('time');

        await Store.addAppointment({
            client,
            serviceId,
            serviceName,
            price,
            date,
            time,
            status: 'pending' // pending, completed, cancelled
        });

        App.closeModal();
        App.renderAgenda();
    },

    completeAppointment: async (id) => {
        if (confirm('¿Marcar cita como completada? Esto sumará al total del día.')) {
            await Store.updateAppointmentStatus(id, 'completed');
            App.renderAgenda();
        }
    },

    deleteAppointment: async (id) => {
        if (confirm('¿Eliminar cita?')) {
            await Store.deleteAppointment(id);
            App.renderAgenda();
        }
    },

    closeModal: () => {
        document.getElementById('modal-container').innerHTML = '';
    }
};

// Initialize App when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
