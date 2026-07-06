export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Manrope', '"SF Pro Text"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
            },
            colors: {
                // Tema Starbucks (aplicado 07/2026) — tokens oficiais do design system da marca
                primary: '#00754A',      // Green Accent — CTA/botões
                primaryDark: '#006241',  // Starbucks Green — hover/títulos
                secondary: '#f2f0eb',    // Neutral Warm — canvas creme
                house: '#1E3932',        // House Green — sidebar/bandas escuras
                mint: '#d4e9e2',         // Green Light — chips/estados válidos
            }
        },
    },
    plugins: [],
}
