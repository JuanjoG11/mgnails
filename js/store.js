/**
 * Data Store for MG Nails Paris
 * Manages Supabase cloud data for Services, Appointments, and Cash Movements
 */

// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://xuurqijrzdphoqhhrytp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dXJxaWpyemRwaG9xaGhyeXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjAxNTksImV4cCI6MjA4NjgzNjE1OX0.VBn_Qur7qCFTRFLbBiIlb7mb2_WJzo7BXkVXzQMubLU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Store = {

    // ─── SERVICES ────────────────────────────────────────────────────────────

    getServices: async () => {
        const { data, error } = await supabaseClient
            .from('services')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching services:', error);
            return [];
        }
        return data || [];
    },

    addService: async (service) => {
        const { error } = await supabaseClient
            .from('services')
            .insert([{ name: service.name, price: service.price }]);

        if (error) console.error('Error adding service:', error);
    },

    deleteService: async (id) => {
        const { error } = await supabaseClient
            .from('services')
            .delete()
            .eq('id', id);

        if (error) console.error('Error deleting service:', error);
    },

    // ─── APPOINTMENTS ────────────────────────────────────────────────────────

    getAppointments: async () => {
        const { data, error } = await supabaseClient
            .from('appointments')
            .select('*')
            .order('date', { ascending: true })
            .order('time', { ascending: true });

        if (error) {
            console.error('Error fetching appointments:', error);
            return [];
        }
        return data || [];
    },

    addAppointment: async (appointment) => {
        const { data, error } = await supabaseClient
            .from('appointments')
            .insert([{
                client:       appointment.client,
                service_id:   appointment.serviceId,
                service_name: appointment.serviceName,
                price:        appointment.price,
                date:         appointment.date,
                time:         appointment.time,
                status:       appointment.status,
                phone:        appointment.phone || null
            }])
            .select()
            .single();

        if (error) {
            console.error('Error adding appointment:', error);
            return null;
        }
        return data;
    },

    updateAppointmentStatus: async (id, status) => {
        const { error } = await supabaseClient
            .from('appointments')
            .update({ status })
            .eq('id', id);

        if (error) console.error('Error updating appointment:', error);
    },

    deleteAppointment: async (id) => {
        const { error } = await supabaseClient
            .from('appointments')
            .delete()
            .eq('id', id);

        if (error) console.error('Error deleting appointment:', error);
    },

    // ─── FINANCIALS (helpers on appointments) ────────────────────────────────

    getDailyTotal: (dateString, appointments = []) => {
        return appointments
            .filter(a => a.date === dateString && a.status === 'completed')
            .reduce((total, a) => total + parseFloat(a.price || 0), 0);
    },

    getMonthlyTotal: (month, year, appointments = []) => {
        return appointments
            .filter(a => {
                const d = new Date(a.date + 'T00:00:00');
                return d.getMonth() === month && d.getFullYear() === year && a.status === 'completed';
            })
            .reduce((total, a) => total + parseFloat(a.price || 0), 0);
    },

    // ─── CASH MOVEMENTS ──────────────────────────────────────────────────────

    getCashMovements: async (dateString) => {
        const { data, error } = await supabaseClient
            .from('cash_movements')
            .select('*')
            .eq('date', dateString)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching cash movements:', error);
            return [];
        }
        return data || [];
    },

    getCashMovementsByMonth: async (month, year) => {
        // month is 0-indexed (JS convention), convert to 1-indexed for the query
        const monthStr = String(month + 1).padStart(2, '0');
        const from = `${year}-${monthStr}-01`;
        // Last day of month
        const lastDay = new Date(year, month + 1, 0).getDate();
        const to = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

        const { data, error } = await supabaseClient
            .from('cash_movements')
            .select('*')
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching monthly cash movements:', error);
            return [];
        }
        return data || [];
    },

    addCashMovement: async ({ type, description, amount, date }) => {
        const { error } = await supabaseClient
            .from('cash_movements')
            .insert([{ type, description, amount, date }]);

        if (error) console.error('Error adding cash movement:', error);
    },

    deleteCashMovement: async (id) => {
        const { error } = await supabaseClient
            .from('cash_movements')
            .delete()
            .eq('id', id);

        if (error) console.error('Error deleting cash movement:', error);
    },

    // ─── CASH MOVEMENT TOTALS (helpers) ──────────────────────────────────────

    getCashTotals: (movements = []) => {
        const cashIn     = movements.filter(m => m.type === 'cash_in')    .reduce((s, m) => s + parseFloat(m.amount || 0), 0);
        const transferIn = movements.filter(m => m.type === 'transfer_in').reduce((s, m) => s + parseFloat(m.amount || 0), 0);
        const expenses   = movements.filter(m => m.type === 'expense')    .reduce((s, m) => s + parseFloat(m.amount || 0), 0);
        const net        = cashIn + transferIn - expenses;
        return { cashIn, transferIn, expenses, net };
    }
};
