import { writable } from 'svelte/store';

function createNotificationStore() {
    const { subscribe, update } = writable([]);

    const send = (message, type = 'default', options = {}) => {
        const id = crypto.randomUUID();
        const duration = options.duration || 3000;
        
        const notification = {
            id,
            message,
            type,
            ...options
        };

        update(n => [...n, notification]);

        if (duration > 0) {
            setTimeout(() => {
                remove(id);
            }, duration);
        }
    };

    const remove = (id) => {
        update(n => n.filter(t => t.id !== id));
    };

    return {
        subscribe,
        send,
        remove,
        success: (msg, opts) => send(msg, 'success', opts),
        error: (msg, opts) => send(msg, 'error', opts),
        info: (msg, opts) => send(msg, 'info', opts)
    };
}

export const notifications = createNotificationStore();
export default notifications;
