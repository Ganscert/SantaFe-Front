# Sistema POS - Santa Fe

Sistema de punto de venta para restaurante con gestión visual de mesas y sincronización en tiempo real.

## 🚀 Cómo ejecutar

### Ejecutar el frontend
```bash
npm run dev
```
El frontend se ejecutará en `http://localhost:5173`

Si accedes desde otro dispositivo en la misma red, usa la IP de tu PC:
`http://TU_IP_LOCAL:5173`

## 📱 Acceso desde múltiples dispositivos

Una vez ejecutando ambos servicios:

1. **Desde tu computadora:** `http://localhost:5173`
2. **Desde tu teléfono/tablet:** `http://TU_IP_LOCAL:5173`

Para encontrar tu IP local:
- **macOS/Linux:** `ifconfig` o `ip addr show`
- **Windows:** `ipconfig`

## ✨ Características

- **Gestión visual de mesas:** Tablero con tarjetas de mesas
- **Sincronización en tiempo real:** Cambios se reflejan en todos los dispositivos conectados
- **Responsive:** Funciona en móviles y tablets
- **Clean Architecture:** Estructura organizada por capas
- **Estado compartido:** Usando React Context + Socket.io

## 🏗️ Arquitectura

```
src/
├── frameworks/
│   ├── router/          # Configuración de rutas
│   ├── ui/              # Componentes de interfaz
│   ├── styles/          # Estilos CSS
│   └── state/           # Estado global (Context + Sockets)
├── domain/              # Lógica de negocio
└── usecases/            # Casos de uso
```

## 🛠️ Tecnologías

- **Frontend:** React 19 + Vite
- **Backend:** Node.js + Express + Socket.io
- **Estilos:** CSS puro con diseño responsive
- **Rutas:** React Router DOM

## 📋 Scripts disponibles

- `npm run dev` - Inicia el servidor de desarrollo
- `npm run server` - Inicia el servidor backend
- `npm run build` - Construye para producción
- `npm run preview` - Vista previa de producción
