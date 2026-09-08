# Traspaso actualizado

Este archivo sustituye el reparto antiguo. El motor, la interfaz guiada y la demo 09:00–13:00 ya están implementados. La referencia principal para cualquier sesión nueva es:

1. `docs/DIRECCION-DE-DISENO.md`
2. `progress.md`
3. el prompt específico de la tarea

## Próximos bloques

### 1. Afilar la demo

Usar `docs/PROMPT-AFILAR-DEMO.md`. Prioridad: ritmo, onboarding, escenas interactivas, conversaciones reactivas del grupo, audio y tres recorridos completos de prueba.

### 2. Crear arte original

Usar `docs/PROMPT-ARTE-ORIGINAL.md`. El repositorio público no debe recibir el PDF ni los recortes derivados de sus ilustraciones.

### 3. Extender la historia

Solo después de validar la demo. El siguiente tramo recomendable es 13:00–19:00 del día 1, manteniendo el mismo patrón:

- escena u oportunidad significativa cada 20–30 minutos ficticios;
- no más de cinco acciones contextuales;
- todo evento importante con rastro y vía alternativa;
- conocimiento individual hasta reunión;
- escenas ramificadas mediante `scene` e `interruptibleBy`;
- pruebas de caminos, custodia, agenda y pérdidas de oportunidad.

## Reglas de entrega

- No añadir volumen por sí mismo: cada cambio debe mejorar decisión, ritmo o consecuencia.
- Conservar la cronología y los hechos centrales del módulo.
- No introducir conocimiento oculto en Caso, Historial o informes prematuros.
- Ejecutar `npm test` y `npm run build`.
- Recorrer en navegador todos los flujos afectados, inspeccionar capturas y consola.
- Actualizar `progress.md` al terminar.
