/**
 * Utilities for MG Nails Paris
 */

const Utils = {

    // Format currency to Euros
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('es-FR', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    },

    // Format a YYYY-MM-DD string for display (avoids timezone shifts)
    formatDate: (dateString) => {
        const [year, month, day] = dateString.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return d.toLocaleDateString('es-ES', options);
    },

    // Get current date formatted
    getCurrentDate: () => {
        return Utils.formatDate(new Date().toISOString().split('T')[0]);
    },

    // Generate unique ID
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Clean phone number: keep only digits and leading +
    cleanPhone: (phone) => {
        if (!phone) return '';
        const cleaned = phone.replace(/[^\d+]/g, '');
        // Ensure + only at the start
        return cleaned.replace(/(?!^)\+/g, '');
    },

    // Capitalise first letter
    capitalize: (str) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    // ─── CANVAS REMINDER CARD ────────────────────────────────────────────────
    /**
     * Draws a minimal, elegant appointment reminder card on a canvas element.
     * Returns the canvas element (600×380).
     */
    drawReminderCard: (appointment) => {
        const W = 600, H = 380;
        const canvas = document.createElement('canvas');
        canvas.width  = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // ── Background: solid dusty rose ──
        ctx.fillStyle = '#F2C4CE';
        ctx.beginPath();
        Utils._roundRect(ctx, 0, 0, W, H, 20);
        ctx.fill();

        // ── Subtle circle decoration (top-right) ──
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(W - 40, -20, 130, 0, Math.PI * 2);
        ctx.fill();
        // bottom-left
        ctx.beginPath();
        ctx.arc(30, H + 10, 100, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // ── Top: brand name ──
        ctx.fillStyle = '#7D3A4A';
        ctx.font = '500 15px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '3px';
        ctx.fillText('MG NAILS PARIS', W / 2, 46);

        // ── Thin divider ──
        ctx.strokeStyle = 'rgba(125, 58, 74, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 60, 58);
        ctx.lineTo(W / 2 + 60, 58);
        ctx.stroke();

        // ── Client name ──
        ctx.fillStyle = '#5A1E2E';
        ctx.font = 'bold 42px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(Utils.capitalize(appointment.client), W / 2, 122);

        // ── Service · Price ──
        ctx.fillStyle = '#9C5566';
        ctx.font = '16px Arial, sans-serif';
        ctx.fillText(
            (appointment.serviceName || appointment.service_name) +
            '   ·   ' +
            Utils.formatCurrency(appointment.price),
            W / 2, 152
        );

        // ── Info pills ──
        const dateFormatted = Utils.capitalize(Utils.formatDate(appointment.date));
        const timeClean     = appointment.time.slice(0, 5); // "17:01" not "17:01:00"
        const infoItems     = [dateFormatted, timeClean];

        let pillY = 192;
        infoItems.forEach(label => {
            // pill background
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            Utils._roundRect(ctx, 100, pillY, W - 200, 42, 21);
            ctx.fill();

            ctx.fillStyle = '#5A1E2E';
            ctx.font = '15px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, W / 2, pillY + 26);
            pillY += 56;
        });

        // ── Footer ──
        ctx.fillStyle = 'rgba(90, 30, 46, 0.5)';
        ctx.font = 'italic 13px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('Te esperamos', W / 2, H - 22);

        return canvas;
    },

    // helper: rounded rectangle path
    _roundRect: (ctx, x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
};
