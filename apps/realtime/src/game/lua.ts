// Scripts Lua: operaciones ATÓMICAS en Redis. Aunque miles de jugadores respondan a la vez
// desde instancias distintas, cada respuesta se procesa una sola vez y en orden.

/**
 * Registrar una respuesta.
 * KEYS: meta, answers, pstate, scores, counts, qinfo
 * ARGV: playerId, qIndex, answerJson, correctness, basePoints, scored(0|1),
 *       streakStep, streakMax, elapsedMs, distKeysJson, deadlineMs, nowMs, shield(0|1)
 * Devuelve: { 'OK', puntos, bono, racha, respondidas, escudoUsado } o { 'ERR', código }
 */
export const SUBMIT_ANSWER = `
local phase = redis.call('HGET', KEYS[1], 'phase')
local qi = redis.call('HGET', KEYS[1], 'qIndex')
if phase ~= 'question' or qi ~= ARGV[2] then return {'ERR', 'CLOSED'} end
if tonumber(ARGV[12]) > tonumber(ARGV[11]) then return {'ERR', 'TIME_UP'} end
if redis.call('HEXISTS', KEYS[2], ARGV[1]) == 1 then return {'ERR', 'DUPLICATE'} end

local correctness = tonumber(ARGV[4])
local base = tonumber(ARGV[5])
local scored = ARGV[6] == '1'
local raw = redis.call('HGET', KEYS[3], ARGV[1])
local ps = raw and cjson.decode(raw) or {s=0, b=0, c=0, a=0, bc=0}
local prev = ps.s or 0
local bonus = 0
local shieldUsed = 0
if scored then
  if correctness >= 1 then
    ps.s = prev + 1
    if ps.s >= 2 then bonus = math.min((ps.s - 1) * tonumber(ARGV[7]), tonumber(ARGV[8])) end
    ps.c = (ps.c or 0) + 1
  elseif ARGV[13] == '1' and prev > 0 then
    -- Escudo: falla sin perder la racha (el escudo se gasta)
    shieldUsed = 1
  else
    ps.s = 0
  end
  if ps.s > (ps.b or 0) then ps.b = ps.s end
end
ps.a = (ps.a or 0) + 1
local points = 0
if correctness > 0 then points = base + bonus end

redis.call('HSET', KEYS[2], ARGV[1], cjson.encode({a=cjson.decode(ARGV[3]), c=correctness, p=points, b=bonus, t=tonumber(ARGV[9]), ps=prev}))
redis.call('HSET', KEYS[3], ARGV[1], cjson.encode(ps))
if points > 0 then redis.call('ZINCRBY', KEYS[4], points, ARGV[1]) end
for _, k in ipairs(cjson.decode(ARGV[10])) do redis.call('HINCRBY', KEYS[5], k, 1) end
if scored and correctness >= 1 then
  redis.call('HINCRBY', KEYS[6], 'correct', 1)
  local fms = redis.call('HGET', KEYS[6], 'fastestMs')
  if not fms or tonumber(ARGV[9]) < tonumber(fms) then
    redis.call('HSET', KEYS[6], 'fastestMs', ARGV[9], 'fastestPid', ARGV[1])
  end
end
return {'OK', points, bonus, ps.s, redis.call('HLEN', KEYS[2]), shieldUsed}
`;

/**
 * Cambio de fase "compara y cambia": solo se aplica si la partida sigue en la fase y pregunta
 * esperadas. Así, si dos instancias intentan cerrar la misma pregunta, solo una lo consigue.
 * KEYS: meta
 * ARGV: fromPhase, fromQIndex ('*' = cualquiera), toPhase, campo1, valor1, campo2, valor2…
 * Devuelve 1 si se aplicó, 0 si no.
 */
export const TRANSITION = `
local phase = redis.call('HGET', KEYS[1], 'phase')
local qi = redis.call('HGET', KEYS[1], 'qIndex')
if phase ~= ARGV[1] then return 0 end
if ARGV[2] ~= '*' and qi ~= ARGV[2] then return 0 end
redis.call('HSET', KEYS[1], 'phase', ARGV[3])
for i = 4, #ARGV, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]) end
return 1
`;

/**
 * Al cerrar una pregunta puntuable, quien no respondió pierde la racha.
 * KEYS: players, answers, pstate
 */
export const RESET_MISSING_STREAKS = `
local ids = redis.call('HKEYS', KEYS[1])
for _, id in ipairs(ids) do
  if redis.call('HEXISTS', KEYS[2], id) == 0 then
    local raw = redis.call('HGET', KEYS[3], id)
    if raw then
      local ps = cjson.decode(raw)
      if (ps.s or 0) > 0 then
        ps.s = 0
        redis.call('HSET', KEYS[3], id, cjson.encode(ps))
      end
    end
  end
end
return #ids
`;

/**
 * Reclamar o renovar la propiedad de los temporizadores de una partida.
 * KEYS: owner — ARGV: instanceId, ttlMs. Devuelve 1 si esta instancia es la dueña.
 */
export const CLAIM_OWNER = `
local cur = redis.call('GET', KEYS[1])
if not cur then
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  return 1
end
if cur == ARGV[1] then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
end
return 0
`;
