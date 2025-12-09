// Utilidades de validación para agenda genérica

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Verifica conflicto entre una nueva reserva y reservas existentes.
 * Aplica un buffer en minutos alrededor del nuevo bloque.
 */
function hasConflict(existing, newStart, newEnd, bufferMinutes) {
  const bufferMs = (bufferMinutes || 0) * 60 * 1000;
  const startWithBuffer = new Date(newStart.getTime() - bufferMs);
  const endWithBuffer = new Date(newEnd.getTime() + bufferMs);

  return (existing || []).some((res) => {
    const s = new Date(res.start);
    const e = new Date(res.end);
    return overlaps(startWithBuffer, endWithBuffer, s, e);
  });
}

module.exports = { overlaps, hasConflict };
