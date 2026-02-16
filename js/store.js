/**
 * Data Store for MG Nails Paris
 * Manages Supabase cloud data for Services and Appointments
 */

// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://xuurqijrzdphoqhhrytp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dXJxaWpyemRwaG9xaGhyeXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjAxNTksImV4cCI6MjA4NjgzNjE1OX0.VBn_Qur7qCFTRFLbBiIlb7mb2_WJzo7BXkVXzQMubLU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Store = {
    // Services (Static for now, can be moved to Supabase later)
    getServices: () => {
        return [
            { id: '1', name: 'Manicura Semipermanente', price: 25 },
            { id: '2', name: 'Pedicura Spa', price: 35 },
            { id: '3', name: 'Uñas Acrílicas', price: 45 },
            { id: '4', name: 'Nail Art (por uña)', price: 2 }
        ];
    },

    // Appointments
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
        const { error } = await supabaseClient
            .from('appointments')
            .insert([{
                client: appointment.client,
                service_id: appointment.serviceId,
                service_name: appointment.serviceName,
                price: appointment.price,
                date: appointment.date,
                time: appointment.time,
                status: appointment.status
            }]);

        if (error) console.error('Error adding appointment:', error);
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

    // Financials
    getDailyTotal: (dateString, appointments = []) => {
        return appointments
            .filter(a => a.date === dateString && a.status === 'completed')
            .reduce((total, a) => total + parseFloat(a.price), 0);
    },

    getMonthlyTotal: (month, year, appointments = []) => {
        return appointments
            .filter(a => {
                const d = new Date(a.date);
                return d.getMonth() === month && d.getFullYear() === year && a.status === 'completed';
            })
            .reduce((total, a) => total + parseFloat(a.price), 0);
    }
};
