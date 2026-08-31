import React, { useState } from 'react';

const ToastContext = React.createContext(null);

export const useToast = () => {
    const context = React.useContext(ToastContext);
    if (!context) {
        console.warn("useToast must be used within a ToastProvider. Returning dummy.");
        return { addToast: (msg) => console.log("Toast (fallback):", msg) };
    }
    return context;
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`
                            px-4 py-2 rounded-lg shadow-lg text-white text-sm font-bold animate-slide-up
                            ${toast.type === 'success' ? 'bg-green-600' : 'bg-blue-600'}
                        `}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
