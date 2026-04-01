/**
 * Horae — Менеджер векторной памяти
 * Локальная система векторного поиска на основе Transformers.js
 *
 * Данные изолированы по chatId, векторы в IndexedDB, лёгкий индекс в chat[0].horae_meta.vectorIndex
 */

import { calculateDetailedRelativeTime } from '../utils/timeUtils.js';

const DB_NAME = 'HoraeVectors';
const DB_VERSION = 1;
const STORE_NAME = 'vectors';

const MODEL_CONFIG = {
    'Xenova/bge-small-zh-v1.5': { dimensions: 512, prefix: null },
    'Xenova/multilingual-e5-small': { dimensions: 384, prefix: { query: 'query: ', passage: 'passage: ' } },
};

const TERM_CATEGORIES = {
    medical: ['包扎', '伤口', '治疗', '救治', '处理伤', '疗伤', '敷药', '上药', '受伤', '负伤', '照料', '护理', '急救', '止血', '绷带', '缝合', '卸甲', '疗养', '中毒', '解毒', '昏迷', '苏醒'],
    combat: ['打架', '打斗', '战斗', '冲突', '交手', '攻击', '击败', '斩杀', '对抗', '格斗', '厮杀', '砍', '劈', '刺', '伏击', '围攻', '决斗', '比武', '防御', '撤退', '逃跑', '追击'],
    cooking: ['做饭', '烹饪', '煮', '炒', '烤', '喂食', '吃饭', '喝粥', '餐', '料理', '膳食', '厨房', '食材', '美食', '下厨', '烘焙'],
    clothing: ['换衣', '更衣', '穿衣', '脱衣', '衣物', '换装', '浴袍', '内衣', '连衣裙', '衬衫'],
    emotion_positive: ['开心', '高兴', '快乐', '欢喜', '喜悦', '愉快', '满足', '感动', '温馨', '幸福'],
    emotion_negative: ['生气', '愤怒', '暴怒', '发火', '恼怒', '难过', '伤心', '悲伤', '哭泣', '落泪', '害怕', '恐惧', '惊恐', '委屈', '失落', '焦虑', '羞耻', '愧疚', '崩溃'],
    movement: ['拖', '搬', '抱', '背', '扶', '抬', '推', '拉', '带走', '转移', '搀扶', '安顿'],
    social: ['告白', '表白', '道歉', '拥抱', '亲吻', '握手', '初次', '重逢', '求婚', '订婚', '结婚'],
    gift: ['礼物', '赠送', '送给', '信物', '定情', '戒指', '项链', '手链', '花束', '巧克力', '贺卡', '纪念品', '嫁妆', '聘礼', '徽章', '勋章', '宝石', '收下', '转赠'],
    ceremony: ['婚礼', '葬礼', '仪式', '典礼', '庆典', '节日', '祭祀', '加冕', '册封', '宣誓', '洗礼', '成人礼', '毕业', '庆祝', '纪念日', '生日', '周年', '祭典', '开幕', '闭幕', '庆功', '宴会', '舞会'],
    revelation: ['秘密', '真相', '揭露', '坦白', '暴露', '发现', '真实身份', '隐瞒', '谎言', '欺骗', '伪装', '冒充', '真名', '血统', '身世', '卧底', '间谍', '告密', '揭穿', '拆穿'],
    promise: ['承诺', '誓言', '约定', '保证', '发誓', '立誓', '契约', '盟约', '许诺', '约好', '守护', '效忠', '誓约'],
    loss: ['死亡', '去世', '牺牲', '离别', '分离', '告别', '失去', '消失', '陨落', '凋零', '永别', '丧失', '阵亡', '殉职', '送别', '诀别', '夭折'],
    power: ['觉醒', '升级', '进化', '突破', '衰退', '失去能力', '解封', '封印', '变身', '异变', '获得力量', '魔力', '能力', '天赋', '血脉', '继承', '传承', '修炼', '领悟'],
    intimate: ['亲热', '缠绵', '情事', '春宵', '欢爱', '共度', '同床', '肌肤之亲', '亲密', '暧昧', '挑逗', '诱惑', '勾引', '撩拨', '调情', '情动', '动情', '欲望', '渴望', '贪恋', '索求', '迎合', '纠缠', '痴缠', '沉沦', '迷恋', '沉溺', '喘息', '颤抖', '呻吟', '娇喘', '低吟', '求饶', '失控', '隐忍', '克制', '放纵', '贪婪', '温存', '余韵', '缱绻', '旖旎', '性交', '内射', '颜射', '性行为', '中出', '射精', '性器', '交配', '野合', '欢爱', '高潮'],
    body_contact: ['抚摸', '触碰', '贴近', '依偎', '搂抱', '吻', '啃咬', '舔', '吮', '摩挲', '揉捏', '按压', '握住', '牵手', '十指相扣', '额头相抵', '耳鬓厮磨', '脸红', '心跳', '身体', '肌肤', '锁骨', '脖颈', '耳垂', '嘴唇', '腰肢', '后背', '发丝', '指尖', '掌心'],
};

export class VectorManager {
    constructor() {
        this.worker = null;
        this.db = null;
        this.chatId = null;
        this.vectors = new Map();
        this.isReady = false;
        this.isLoading = false;
        this.isApiMode = false;
        this.dimensions = 0;
        this.modelName = '';
        this._apiUrl = '';
        this._apiKey = '';
        this._apiModel = '';
        this.termCounts = new Map();
        this.totalDocuments = 0;
        this._pendingCallbacks = new Map();
        this._callId = 0;
    }

    // ========================================
    // Жизненный цикл
    // ========================================

    async initModel(model, dtype, onProgress) {
        if (this.isLoading) return;
        this.isLoading = true;
        this.isReady = false;
        this.modelName = model;

        try {
            await this._disposeWorker();

            const workerUrl = new URL('../utils/embeddingWorker.js', import.meta.url);
            this.worker = new Worker(workerUrl, { type: 'module' });

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Таймаут загрузки модели (5 минут)')), 300000);

                this.worker.onmessage = (e) => {
                    const { type, data, dimensions: dims } = e.data;
                    if (type === 'progress' && onProgress) {
                        onProgress(data);
                    } else if (type === 'ready') {
                        this.dimensions = dims;
                        this.isReady = true;
                        clearTimeout(timeout);
                        resolve();
                    } else if (type === 'error') {
                        clearTimeout(timeout);
                        reject(new Error(e.data.message));
                    } else if (type === 'result' || type === 'disposed') {
                        const cb = this._pendingCallbacks.get(e.data.id);
                        if (cb) {
                            this._pendingCallbacks.delete(e.data.id);
                            cb.resolve(e.data);
                        }
                    }
                };

                this.worker.onerror = (err) => {
                    clearTimeout(timeout);
                    reject(new Error(err.message || 'Ошибка загрузки Worker'));
                };

                this.worker.postMessage({ type: 'init', data: { model, dtype: dtype || 'q8' } });
            });

            this.worker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'result' || msg.type === 'error' || msg.type === 'disposed') {
                    const cb = this._pendingCallbacks.get(msg.id);
                    if (cb) {
                        this._pendingCallbacks.delete(msg.id);
                        if (msg.type === 'error') cb.reject(new Error(msg.message));
                        else cb.resolve(msg);
                    }
                }
            };

            console.log(`[Horae Vector] Модель загружена: ${model} (${this.dimensions}D)`);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Инициализация API-режима (OpenAI-совместимый embedding endpoint)
     */
    async initApi(url, key, model) {
        if (this.isLoading) return;
        this.isLoading = true;
        this.isReady = false;

        try {
            await this._disposeWorker();

            this.isApiMode = true;
            this._apiUrl = url.replace(/\/+$/, '');
            this._apiKey = key;
            this._apiModel = model;
            this.modelName = model;

            // 探测维度：发一条测试文本
            const testResult = await this._embedApi(['test']);
            if (!testResult?.vectors?.[0]) {
                throw new Error('Ошибка подключения API или неверный формат ответа. Проверьте адрес, ключ и название модели');
            }
            this.dimensions = testResult.vectors[0].length;
            this.isReady = true;
            console.log(`[Horae Vector] API-режим готов: ${model} (${this.dimensions}D)`);
        } finally {
            this.isLoading = false;
        }
    }

    async dispose() {
        await this._disposeWorker();
        this.vectors.clear();
        this.termCounts.clear();
        this.totalDocuments = 0;
        this.chatId = null;
        this.isReady = false;
        this.isApiMode = false;
        this._apiUrl = '';
        this._apiKey = '';
        this._apiModel = '';
    }

    async _disposeWorker() {
        if (this.worker) {
            try {
                this.worker.postMessage({ type: 'dispose' });
                await new Promise(r => setTimeout(r, 200));
            } catch (_) { /* ignore */ }
            this.worker.terminate();
            this.worker = null;
        }
        this._pendingCallbacks.clear();
    }

    /**
     * Переключение чата: загрузить векторный индекс для chatId
     */
    async loadChat(chatId, chat) {
        this.chatId = chatId;
        this.vectors.clear();
        this.termCounts.clear();
        this.totalDocuments = 0;

        if (!chatId) return;

        try {
            await this._openDB();
            const stored = await this._loadAllVectors();
            const staleKeys = [];
            for (const item of stored) {
                if (item.messageIndex >= chat.length) {
                    staleKeys.push(item.messageIndex);
                    continue;
                }
                const doc = this.buildVectorDocument(chat[item.messageIndex]?.horae_meta);
                if (doc && this._hashString(doc) !== item.hash) {
                    staleKeys.push(item.messageIndex);
                    continue;
                }
                this.vectors.set(item.messageIndex, {
                    vector: item.vector,
                    hash: item.hash,
                    document: item.document,
                });
                this._updateTermCounts(item.document, 1);
                this.totalDocuments++;
            }
            if (staleKeys.length > 0) {
                for (const idx of staleKeys) await this._deleteVector(idx);
                console.log(`[Horae Vector] Очищено ${staleKeys.length} устаревших/вне ветки векторов`);
            }
            console.log(`[Horae Vector] Загружено ${this.vectors.size} векторов (chatId: ${chatId})`);
        } catch (err) {
            console.warn('[Horae Vector] Ошибка загрузки векторного индекса:', err);
        }
    }

    // ========================================
    // Построение документов
    // ========================================

    /**
     * Сериализовать horae_meta в текст для поиска
     * Сводки событий — основа (максимальный вес), сцена/персонажи/NPC — вспомогательные
     * Убрать шум от предметов, одежды, настроения, чтобы embedding фокусировался на семантически важном
     */
    buildVectorDocument(meta) {
        if (!meta) return '';

        const eventTexts = [];
        if (meta.events?.length > 0) {
            for (const evt of meta.events) {
                if (evt.isSummary || evt.level === '摘要' || evt._summaryId) continue;
                if (evt.summary) eventTexts.push(evt.summary);
            }
        }

        const npcTexts = [];
        if (meta.npcs) {
            for (const [name, info] of Object.entries(meta.npcs)) {
                let s = name;
                if (info.appearance) s += ` ${info.appearance}`;
                if (info.relationship) s += ` ${info.relationship}`;
                npcTexts.push(s);
            }
        }

        if (eventTexts.length === 0 && npcTexts.length === 0) return '';

        const parts = [];

        for (const t of eventTexts) parts.push(t);

        for (const t of npcTexts) parts.push(t);

        if (meta.scene?.location) parts.push(meta.scene.location);

        const chars = meta.scene?.characters_present || [];
        if (chars.length > 0) parts.push(chars.join(' '));

        if (meta.timestamp?.story_date) {
            parts.push(meta.timestamp.story_time
                ? `${meta.timestamp.story_date} ${meta.timestamp.story_time}`
                : meta.timestamp.story_date);
        }

        // RPG milestones: level changes, equipment events, stronghold changes
        const rpg = meta._rpgChanges;
        if (rpg) {
            if (rpg.levels && Object.keys(rpg.levels).length > 0) {
                for (const [owner, lv] of Object.entries(rpg.levels)) {
                    parts.push(`${owner} повысил уровень до Lv.${lv}`);
                }
            }
            for (const eq of (rpg.equipment || [])) {
                parts.push(`${eq.owner} экипировал ${eq.name}(${eq.slot})`);
            }
            for (const u of (rpg.unequip || [])) {
                parts.push(`${u.owner} снял ${u.name}(${u.slot})`);
            }
            for (const bc of (rpg.baseChanges || [])) {
                if (bc.field === 'level') parts.push(`Опорный пункт ${bc.path} повышен до Lv.${bc.value}`);
            }
        }

        return parts.join(' | ');
    }

    // ========================================
    // Операции с индексом
    // ========================================

    async addMessage(messageIndex, meta) {
        if (!this.isReady || !this.chatId) return;
        if (meta?._skipHorae) return;

        const doc = this.buildVectorDocument(meta);
        if (!doc) return;

        const hash = this._hashString(doc);
        const existing = this.vectors.get(messageIndex);
        if (existing && existing.hash === hash) return;

        const text = this._prepareText(doc, false);
        const result = await this._embed([text]);
        if (!result || !result.vectors?.[0]) return;

        const vector = result.vectors[0];

        if (existing) {
            this._updateTermCounts(existing.document, -1);
        } else {
            this.totalDocuments++;
        }

        this.vectors.set(messageIndex, { vector, hash, document: doc });
        this._updateTermCounts(doc, 1);
        await this._saveVector(messageIndex, { vector, hash, document: doc });
    }

    async removeMessage(messageIndex) {
        const existing = this.vectors.get(messageIndex);
        if (!existing) return;

        this._updateTermCounts(existing.document, -1);
        this.totalDocuments--;
        this.vectors.delete(messageIndex);
        await this._deleteVector(messageIndex);
    }

    /**
     * Пакетное построение индекса (для истории сообщений)
     * @returns {{ indexed: number, skipped: number }}
     */
    async batchIndex(chat, onProgress) {
        if (!this.isReady || !this.chatId) return { indexed: 0, skipped: 0 };

        const tasks = [];
        for (let i = 0; i < chat.length; i++) {
            const meta = chat[i].horae_meta;
            if (!meta || chat[i].is_user) continue;
            if (meta._skipHorae) continue;
            const doc = this.buildVectorDocument(meta);
            if (!doc) continue;
            const hash = this._hashString(doc);
            const existing = this.vectors.get(i);
            if (existing && existing.hash === hash) continue;
            tasks.push({ messageIndex: i, document: doc, hash });
        }

        if (tasks.length === 0) return { indexed: 0, skipped: chat.length };

        const batchSize = this.isApiMode ? 8 : 16;
        let indexed = 0;

        for (let b = 0; b < tasks.length; b += batchSize) {
            const batch = tasks.slice(b, b + batchSize);
            const texts = batch.map(t => this._prepareText(t.document, false));
            const result = await this._embed(texts);
            if (!result?.vectors) continue;

            for (let j = 0; j < batch.length; j++) {
                const task = batch[j];
                const vector = result.vectors[j];
                if (!vector) continue;

                const old = this.vectors.get(task.messageIndex);
                if (old) {
                    this._updateTermCounts(old.document, -1);
                } else {
                    this.totalDocuments++;
                }

                this.vectors.set(task.messageIndex, {
                    vector,
                    hash: task.hash,
                    document: task.document,
                });
                this._updateTermCounts(task.document, 1);
                await this._saveVector(task.messageIndex, { vector, hash: task.hash, document: task.document });
                indexed++;
            }

            if (onProgress) {
                onProgress({ current: Math.min(b + batchSize, tasks.length), total: tasks.length });
            }
        }

        return { indexed, skipped: chat.length - tasks.length };
    }

    async clearIndex() {
        this.vectors.clear();
        this.termCounts.clear();
        this.totalDocuments = 0;
        if (this.chatId) await this._clearVectors();
    }

    // ========================================
    // Запросы и поиск
    // ========================================

    /**
     * Построить текст запроса по состоянию (текущая сцена/персонажи/события)
     */
    buildStateQuery(currentState, lastMeta) {
        const parts = [];

        if (currentState.scene?.location) parts.push(currentState.scene.location);

        const chars = currentState.scene?.characters_present || [];
        for (const c of chars) {
            parts.push(c);
            if (currentState.costumes?.[c]) parts.push(currentState.costumes[c]);
        }

        if (lastMeta?.events?.length > 0) {
            for (const evt of lastMeta.events) {
                if (evt.summary) parts.push(evt.summary);
            }
        }

        return parts.filter(Boolean).join(' ');
    }

    /**
     * Очистить сообщение пользователя в текст запроса
     */
    cleanUserMessage(rawMessage) {
        if (!rawMessage) return '';
        return rawMessage
            .replace(/<[^>]*>/g, '')
            .replace(/[\[\]]/g, '')
            .trim()
            .substring(0, 300);
    }

    /**
     * Векторный поиск
     * @param {string} queryText
     * @param {number} topK
     * @param {number} threshold
     * @param {Set<number>} excludeIndices - исключаемые индексы сообщений (уже в контексте)
     * @returns {Promise<Array<{messageIndex: number, similarity: number, document: string}>>}
     */
    async search(queryText, topK = 5, threshold = 0.72, excludeIndices = new Set(), pureMode = false) {
        if (!this.isReady || !queryText || this.vectors.size === 0) return [];

        const prepared = this._prepareText(queryText, true);
        console.log('[Horae Vector] Начат embedding-запрос...');
        const result = await this._embed([prepared]);
        if (!result?.vectors?.[0]) {
            console.warn('[Horae Vector] embedding вернул пустой результат:', result);
            return [];
        }

        const queryVec = result.vectors[0];
        console.log(`[Horae Vector] Размерность вектора запроса: ${queryVec.length}, сравнение с ${this.vectors.size} записями...`);

        const scored = [];
        const allScored = [];
        let searchedCount = 0;

        for (const [msgIdx, entry] of this.vectors) {
            if (excludeIndices.has(msgIdx)) continue;
            searchedCount++;
            const sim = this._dotProduct(queryVec, entry.vector);
            allScored.push({ messageIndex: msgIdx, similarity: sim, document: entry.document });
            if (sim >= threshold) {
                scored.push({ messageIndex: msgIdx, similarity: sim, document: entry.document });
            }
        }

        allScored.sort((a, b) => b.similarity - a.similarity);
        const bestSim = allScored.length > 0 ? allScored[0].similarity : 0;
        console.log(`[Horae Vector] Поиск по ${searchedCount} записям | макс. сходство=${bestSim.toFixed(4)} | выше порога(${threshold}): ${scored.length}`);
        if (scored.length === 0 && allScored.length > 0) {
            console.log(`[Horae Vector] 阈值下 Top-5 候选:`);
            for (const c of allScored.slice(0, 5)) {
                console.log(`  #${c.messageIndex} sim=${c.similarity.toFixed(4)} | ${c.document.substring(0, 60)}`);
            }
        }

        scored.sort((a, b) => b.similarity - a.similarity);

        const adjusted = pureMode ? scored : this._adjustThresholdByFrequency(scored, threshold);
        if (!pureMode) console.log(`[Horae Vector] После частотного фильтра: ${adjusted.length}`);

        const deduped = this._deduplicateResults(adjusted);
        console.log(`[Horae Vector] После дедупликации: ${deduped.length}`);

        return deduped.slice(0, topK);
    }

    /**
     * Стратегия B: штраф высокочастотного контента
     * Слегка повышать порог только если >80% слов документа являются общими (встречаются в >60% документов),
     * чтобы имена персонажей и другие неизбежно частые слова не отсекали валидные результаты.
     */
    _adjustThresholdByFrequency(results, baseThreshold) {
        if (results.length < 2 || this.totalDocuments < 10) return results;

        return results.filter(r => {
            const terms = this._extractKeyTerms(r.document);
            if (terms.length === 0) return true;

            let commonCount = 0;
            for (const term of terms) {
                const count = this.termCounts.get(term) || 0;
                if (count / this.totalDocuments > 0.6) commonCount++;
            }
            const commonRatio = commonCount / terms.length;

            if (commonRatio > 0.8) {
                const penalty = (commonRatio - 0.8) * 0.1;
                return r.similarity >= baseThreshold + penalty;
            }
            return true;
        });
    }

    /**
     * Стратегия C: свёртка высокопохожих результатов
     */
    _deduplicateResults(results) {
        if (results.length <= 1) return results;

        const kept = [results[0]];
        for (let i = 1; i < results.length; i++) {
            const candidate = results[i];
            let isDuplicate = false;
            for (const existing of kept) {
                const mutualSim = this._dotProduct(
                    this.vectors.get(existing.messageIndex)?.vector || [],
                    this.vectors.get(candidate.messageIndex)?.vector || []
                );
                if (mutualSim > 0.92) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) kept.push(candidate);
        }
        return kept;
    }

    // ========================================
    // Построение промпта для recall
    // ========================================

    /**
     * Умный recall: структурированный запрос + векторный поиск параллельно, объединение результатов
     */
    async generateRecallPrompt(horaeManager, skipLast, settings) {
        const chat = horaeManager.getChat();
        const state = horaeManager.getLatestState(skipLast);
        const topK = settings.vectorTopK || 5;
        const threshold = settings.vectorThreshold ?? 0.72;

        let rawUserMsg = '';
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i].is_user) { rawUserMsg = chat[i].mes || ''; break; }
        }
        const userQuery = this.cleanUserMessage(rawUserMsg);

        const EXCLUDE_RECENT = 5;
        const excludeIndices = new Set();
        for (let i = Math.max(0, chat.length - EXCLUDE_RECENT); i < chat.length; i++) {
            excludeIndices.add(i);
        }

        const merged = new Map();

        const pureMode = !!settings.vectorPureMode;
        if (pureMode) console.log('[Horae Vector] Режим чистых векторов включён, пропуск эвристики ключевых слов');

        const structuredResults = this._structuredQuery(userQuery, chat, state, excludeIndices, topK, pureMode);
        console.log(`[Horae Vector] Структурированный запрос: ${structuredResults.length} попаданий`);
        for (const r of structuredResults) {
            merged.set(r.messageIndex, r);
        }

        const hybridResults = await this._hybridSearch(userQuery, state, horaeManager, skipLast, settings, excludeIndices, topK, threshold, pureMode);
        console.log(`[Horae Vector] Гибридный векторный поиск: ${hybridResults.length} попаданий`);
        for (const r of hybridResults) {
            if (!merged.has(r.messageIndex)) {
                merged.set(r.messageIndex, r);
            }
        }

        // Взвешивание по релевантности персонажей (мульти-карточка):
        // Собрать «релевантных персонажей» = упомянутые в сообщении пользователя + текущие присутствующие
        // Применить небольшой положительный вес к результатам с релевантными персонажами, приоритет recall связанных событий
        // Не фильтровать никакие результаты, чтобы перекрёстные ссылки персонажей (напр. упоминание B при разговоре с A) всё ещё recall
        const relevantChars = new Set(state.scene?.characters_present || []);
        const allKnownChars = new Set();
        for (let i = 0; i < chat.length; i++) {
            const m = chat[i].horae_meta;
            if (!m) continue;
            (m.scene?.characters_present || []).forEach(c => allKnownChars.add(c));
            if (m.npcs) Object.keys(m.npcs).forEach(c => allKnownChars.add(c));
        }
        for (const c of allKnownChars) {
            if (userQuery && userQuery.includes(c)) relevantChars.add(c);
        }

        let results = Array.from(merged.values());
        if (relevantChars.size > 0) {
            for (const r of results) {
                const meta = chat[r.messageIndex]?.horae_meta;
                if (!meta) continue;
                const docChars = new Set([
                    ...(meta.scene?.characters_present || []),
                    ...Object.keys(meta.npcs || {}),
                ]);
                let hasRelevant = false;
                for (const c of relevantChars) {
                    if (docChars.has(c)) { hasRelevant = true; break; }
                }
                if (hasRelevant) {
                    r.similarity += 0.03;
                }
            }
            console.log(`[Horae Vector] Взвешивание по персонажам: релевантные=[${[...relevantChars].join(',')}]`);
        }

        results.sort((a, b) => b.similarity - a.similarity);

        // Rerank: вторичная сортировка кандидатов
        if (settings.vectorRerankEnabled && settings.vectorRerankModel && results.length > 1) {
            const rerankCandidates = results.slice(0, topK * 3);
            const rerankQuery = userQuery || this.buildStateQuery(state, null);
            if (rerankQuery) {
                try {
                    const useFullText = !!settings.vectorRerankFullText;
                    const _stripTags = settings.vectorStripTags || '';
                    const rerankDocs = rerankCandidates.map(r => {
                        if (useFullText) {
                            const fullText = this._extractCleanText(chat[r.messageIndex]?.mes, _stripTags);
                            return fullText || r.document;
                        }
                        return r.document;
                    });
                    console.log(`[Horae Vector] Режим Rerank: ${useFullText ? 'полнотекстовая сортировка' : 'сортировка по сводкам'}`);

                    const reranked = await this._rerank(
                        rerankQuery,
                        rerankDocs,
                        topK,
                        settings
                    );
                    if (reranked && reranked.length > 0) {
                        console.log(`[Horae Vector] Rerank завершён: ${reranked.length} записей`);
                        results = reranked.map(rr => {
                            const original = rerankCandidates[rr.index];
                            return {
                                ...original,
                                similarity: rr.relevance_score,
                                source: original.source + (useFullText ? '+rerank-full' : '+rerank'),
                            };
                        });
                    }
                } catch (err) {
                    console.warn('[Horae Vector] Ошибка Rerank, используется исходный порядок:', err.message);
                }
            }
        }

        results = results.slice(0, topK);

        console.log(`[Horae Vector] === Итоговое объединение: ${results.length} записей ===`);
        for (const r of results) {
            console.log(`  #${r.messageIndex} sim=${r.similarity.toFixed(3)} [${r.source}]`);
        }

        if (results.length === 0) return '';

        const currentDate = state.timestamp?.story_date;
        const fullTextCount = Math.min(settings.vectorFullTextCount ?? 3, topK);
        const fullTextThreshold = settings.vectorFullTextThreshold ?? 0.9;
        const recallText = this._buildRecallText(results, currentDate, chat, fullTextCount, fullTextThreshold, settings.vectorStripTags || '');
        console.log(`[Horae Vector] Текст recall (${recallText.length} симв.):\n${recallText}`);
        return recallText;
    }

    // ========================================
    // Структурированный запрос (точный, без векторов)
    // ========================================

    /**
     * Разобрать намерение из сообщения пользователя, напрямую запросить структурированные данные horae_meta
     */
    _structuredQuery(userQuery, chat, state, excludeIndices, topK, pureMode = false) {
        if (!userQuery || chat.length === 0) return [];

        const knownChars = new Set();
        for (let i = 0; i < chat.length; i++) {
            const m = chat[i].horae_meta;
            if (!m) continue;
            (m.scene?.characters_present || []).forEach(c => knownChars.add(c));
            if (m.npcs) Object.keys(m.npcs).forEach(c => knownChars.add(c));
        }

        const mentionedChars = [];
        for (const c of knownChars) {
            if (userQuery.includes(c)) mentionedChars.push(c);
        }

        const isFirst = /第一次|初次|首次|初见|初遇|最早|一开始/.test(userQuery);
        const isLast = /上次|上一次|最后一次|最近一次|之前/.test(userQuery);

        const hasCostumeKw = /穿|戴|换|衣|裙|裤|袍|衫|装|鞋/.test(userQuery);
        const hasMoodKw = /生气|愤怒|开心|高兴|难过|伤心|哭|害怕|恐惧|害羞|羞耻|得意|满足|嫉妒|悲伤|焦虑|紧张|兴奋|感动|温柔|冷漠/.test(userQuery);
        const hasGiftKw = /礼物|赠送|送给|送的|信物|定情|收到|收下|转赠|聘礼|嫁妆|纪念品|贺卡/.test(userQuery);
        const hasImportantItemKw = /重要.{0,2}(物品|东西|道具|宝物)|关键.{0,2}(物品|东西|道具|宝物)|珍贵|宝贝|宝物|神器|秘宝|圣物/.test(userQuery);
        const hasImportantEventKw = /重要.{0,2}(事|事件|经历)|关键.{0,2}(事|事件|转折)|大事|转折|里程碑/.test(userQuery);
        const hasCeremonyKw = /婚礼|葬礼|仪式|典礼|庆典|节日|祭祀|加冕|册封|宣誓|洗礼|成人礼|庆祝|宴会|舞会|祭典/.test(userQuery);
        const hasPromiseKw = /承诺|誓言|约定|保证|发誓|立誓|契约|盟约|许诺/.test(userQuery);
        const hasLossKw = /死亡|去世|牺牲|离别|分离|告别|失去|消失|陨落|永别|诀别|阵亡/.test(userQuery);
        const hasRevelationKw = /秘密|真相|揭露|坦白|暴露|真实身份|隐瞒|谎言|欺骗|伪装|冒充|真名|血统|身世|揭穿/.test(userQuery);
        const hasPowerKw = /觉醒|升级|进化|突破|衰退|失去能力|解封|封印|变身|异变|获得力量|血脉|继承|传承|领悟/.test(userQuery);

        const results = [];

        if (isFirst && mentionedChars.length > 0) {
            for (const charName of mentionedChars) {
                const idx = this._findFirstAppearance(chat, charName, excludeIndices);
                if (idx !== -1) {
                    results.push({ messageIndex: idx, similarity: 1.0, document: `[Структурированный] ${charName} первое появление`, source: 'structured' });
                    console.log(`[Horae Vector] Структурированный запрос: "${charName}" впервые появился в #${idx}`);
                }
            }
        }

        if (isLast && mentionedChars.length > 0 && hasCostumeKw) {
            const costumeKw = this._extractCostumeKeywords(userQuery, mentionedChars);
            if (costumeKw) {
                for (const charName of mentionedChars) {
                    const idx = this._findLastCostume(chat, charName, costumeKw, excludeIndices);
                    if (idx !== -1) {
                        results.push({ messageIndex: idx, similarity: 1.0, document: `[Структурированный] ${charName} носит ${costumeKw}`, source: 'structured' });
                        console.log(`[Horae Vector] Структурированный запрос: "${charName}" последний раз носил "${costumeKw}" в #${idx}`);
                    }
                }
            }
        }

        if (hasCostumeKw && !isFirst && !isLast && mentionedChars.length === 0) {
            const costumeKw = this._extractCostumeKeywords(userQuery, []);
            if (costumeKw) {
                const matches = this._findCostumeMatches(chat, costumeKw, excludeIndices, topK);
                for (const m of matches) {
                    results.push({ messageIndex: m.idx, similarity: 0.95, document: `[Структурированный] совпадение одежды:${costumeKw}`, source: 'structured' });
                }
            }
        }

        if (isLast && hasMoodKw) {
            const moodKw = this._extractMoodKeyword(userQuery);
            if (moodKw) {
                const targetChar = mentionedChars[0] || null;
                const idx = this._findLastMood(chat, targetChar, moodKw, excludeIndices);
                if (idx !== -1) {
                    results.push({ messageIndex: idx, similarity: 1.0, document: `[Структурированный] совпадение эмоции:${moodKw}`, source: 'structured' });
                    console.log(`[Horae Vector] Структурированный запрос: последний раз "${moodKw}" в #${idx}`);
                }
            }
        }

        if (hasGiftKw) {
            const giftResults = this._findGiftItems(chat, mentionedChars, excludeIndices, topK);
            for (const r of giftResults) {
                results.push(r);
                console.log(`[Horae Vector] Структурированный запрос: подарки #${r.messageIndex} [${r.document}]`);
            }
        }

        if (hasImportantItemKw) {
            const impResults = this._findImportantItems(chat, excludeIndices, topK);
            for (const r of impResults) {
                results.push(r);
                console.log(`[Horae Vector] Структурированный запрос: важные предметы #${r.messageIndex} [${r.document}]`);
            }
        }

        if (hasImportantEventKw) {
            const evtResults = this._findImportantEvents(chat, excludeIndices, topK);
            for (const r of evtResults) {
                results.push(r);
                console.log(`[Horae Vector] Структурированный запрос: важные события #${r.messageIndex} [${r.document}]`);
            }
        }

        // В режиме чистых векторов пропуск эвристики ключевых слов, полная опора на семантику векторов
        if (!pureMode) {
            if (hasCeremonyKw || hasPromiseKw || hasLossKw || hasRevelationKw || hasPowerKw) {
                const thematicResults = this._findThematicEvents(chat, {
                    ceremony: hasCeremonyKw, promise: hasPromiseKw,
                    loss: hasLossKw, revelation: hasRevelationKw, power: hasPowerKw,
                }, excludeIndices, topK);
                for (const r of thematicResults) {
                    results.push(r);
                    console.log(`[Horae Vector] Структурированный запрос: тематические события #${r.messageIndex} [${r.document}]`);
                }
            }

            const existingIds = new Set(results.map(r => r.messageIndex));
            const eventMatches = this._eventKeywordSearch(userQuery, chat, mentionedChars, existingIds, excludeIndices, topK);
            for (const m of eventMatches) {
                results.push(m);
            }
        }

        const withContext = this._expandContextWindow(results, chat, excludeIndices);
        return withContext.slice(0, topK);
    }

    /**
     * Расширение контекстного окна: для каждого найденного сообщения добавить соседние AI-сообщения
     * В RP соседние сообщения — последовательные события, естественно связаны
     */
    _expandContextWindow(results, chat, excludeIndices) {
        const resultIds = new Set(results.map(r => r.messageIndex));
        const contextToAdd = [];

        for (const r of results) {
            const idx = r.messageIndex;

            for (let i = idx - 1; i >= Math.max(0, idx - 3); i--) {
                if (excludeIndices.has(i) || resultIds.has(i)) continue;
                const m = chat[i].horae_meta;
                if (!chat[i].is_user && this._hasOriginalEvents(m)) {
                    contextToAdd.push({
                        messageIndex: i,
                        similarity: r.similarity * 0.85,
                        document: `[Контекст] предшествующее событие #${idx}`,
                        source: 'context',
                    });
                    resultIds.add(i);
                    break;
                }
            }

            for (let i = idx + 1; i <= Math.min(chat.length - 1, idx + 3); i++) {
                if (excludeIndices.has(i) || resultIds.has(i)) continue;
                const m = chat[i].horae_meta;
                if (!chat[i].is_user && this._hasOriginalEvents(m)) {
                    contextToAdd.push({
                        messageIndex: i,
                        similarity: r.similarity * 0.85,
                        document: `[Контекст] последующее событие #${idx}`,
                        source: 'context',
                    });
                    resultIds.add(i);
                    break;
                }
            }
        }

        if (contextToAdd.length > 0) {
            console.log(`[Horae Vector] Расширение контекста: +${contextToAdd.length} записей`);
            for (const c of contextToAdd) console.log(`  #${c.messageIndex} [${c.document}]`);
        }

        const all = [...results, ...contextToAdd];
        all.sort((a, b) => b.similarity - a.similarity);
        return all;
    }

    /**
     * Поиск по ключевым словам событий: сканировать известные категории слов из текста пользователя, затем искать в сводках событий
     */
    _eventKeywordSearch(userQuery, chat, mentionedChars, skipIds, excludeIndices, limit) {
        const detected = this._detectCategoryTerms(userQuery);
        if (detected.length === 0) return [];

        const expanded = this._expandByCategory(detected);
        console.log(`[Horae Vector] Поиск событий: обнаружено=[${detected.join(',')}] после расширения=[${expanded.join(',')}]`);

        const scored = [];
        for (let i = 0; i < chat.length; i++) {
            if (excludeIndices.has(i) || skipIds.has(i)) continue;
            const meta = chat[i].horae_meta;
            if (!meta) continue;

            const searchText = this._buildSearchableText(meta);
            if (!searchText) continue;

            let matchCount = 0;
            const matched = [];
            for (const kw of expanded) {
                if (searchText.includes(kw)) {
                    matchCount++;
                    matched.push(kw);
                }
            }

            if (matchCount >= 2 || (matchCount >= 1 && mentionedChars.some(c => searchText.includes(c)))) {
                scored.push({
                    messageIndex: i,
                    similarity: 0.85 + matchCount * 0.02,
                    document: `[Совп. событий] ${matched.join(',')}`,
                    source: 'structured',
                    _matchCount: matchCount,
                });
            }
        }

        scored.sort((a, b) => b._matchCount - a._matchCount || b.similarity - a.similarity);
        const top = scored.slice(0, limit);
        if (top.length > 0) {
            console.log(`[Horae Vector] Поиск событий: ${top.length} попаданий:`);
            for (const r of top) console.log(`  #${r.messageIndex} matches=${r._matchCount} [${r.document}]`);
        }
        return top;
    }

    _buildSearchableText(meta) {
        const parts = [];
        if (meta.events) {
            for (const evt of meta.events) {
                if (evt.isSummary || evt.level === '摘要' || evt._summaryId) continue;
                if (evt.summary) parts.push(evt.summary);
            }
        }
        if (meta.scene?.location) parts.push(meta.scene.location);
        if (meta.npcs) {
            for (const [name, info] of Object.entries(meta.npcs)) {
                parts.push(name);
                if (info.description) parts.push(info.description);
            }
        }
        if (meta.items) {
            for (const [name, info] of Object.entries(meta.items)) {
                parts.push(name);
                if (info.location) parts.push(info.location);
            }
        }
        return parts.join(' ');
    }

    /**
     * Сканировать известные слова из TERM_CATEGORIES прямо в тексте пользователя (без токенизации)
     */
    _detectCategoryTerms(text) {
        const found = [];
        for (const terms of Object.values(TERM_CATEGORIES)) {
            for (const term of terms) {
                if (text.includes(term)) {
                    found.push(term);
                }
            }
        }
        return [...new Set(found)];
    }

    /**
     * Расширить обнаруженные слова на все слова той же категории
     */
    _expandByCategory(keywords) {
        const expanded = new Set(keywords);
        for (const kw of keywords) {
            for (const terms of Object.values(TERM_CATEGORIES)) {
                if (terms.includes(kw)) {
                    for (const t of terms) expanded.add(t);
                }
            }
        }
        return [...expanded];
    }

    _findFirstAppearance(chat, charName, excludeIndices) {
        for (let i = 0; i < chat.length; i++) {
            if (excludeIndices.has(i)) continue;
            const m = chat[i].horae_meta;
            if (!m) continue;
            if (m.npcs && m.npcs[charName]) return i;
            if (m.scene?.characters_present?.includes(charName)) return i;
        }
        return -1;
    }

    _findLastCostume(chat, charName, costumeKw, excludeIndices) {
        for (let i = chat.length - 1; i >= 0; i--) {
            if (excludeIndices.has(i)) continue;
            const costume = chat[i].horae_meta?.costumes?.[charName];
            if (costume && costume.includes(costumeKw)) return i;
        }
        return -1;
    }

    _findCostumeMatches(chat, costumeKw, excludeIndices, limit) {
        const matches = [];
        for (let i = chat.length - 1; i >= 0 && matches.length < limit; i--) {
            if (excludeIndices.has(i)) continue;
            const costumes = chat[i].horae_meta?.costumes;
            if (!costumes) continue;
            for (const v of Object.values(costumes)) {
                if (v && v.includes(costumeKw)) { matches.push({ idx: i }); break; }
            }
        }
        return matches;
    }

    _findLastMood(chat, charName, moodKw, excludeIndices) {
        for (let i = chat.length - 1; i >= 0; i--) {
            if (excludeIndices.has(i)) continue;
            const mood = chat[i].horae_meta?.mood;
            if (!mood) continue;
            if (charName) {
                if (mood[charName] && mood[charName].includes(moodKw)) return i;
            } else {
                for (const v of Object.values(mood)) {
                    if (v && v.includes(moodKw)) return i;
                }
            }
        }
        return -1;
    }

    _extractCostumeKeywords(query, chars) {
        let cleaned = query;
        for (const c of chars) cleaned = cleaned.replace(c, '');
        cleaned = cleaned.replace(/上次|上一次|最后一次|之前|穿|戴|换|的|了|过|着|那件|那套|那个/g, '').trim();
        return cleaned.length >= 2 ? cleaned : '';
    }

    _extractMoodKeyword(query) {
        const moodWords = ['生气', '愤怒', '开心', '高兴', '难过', '伤心', '哭泣', '害怕', '恐惧', '害羞', '羞耻', '得意', '满足', '嫉妒', '悲伤', '焦虑', '紧张', '兴奋', '感动', '温柔', '冷漠', '暴怒', '委屈', '失落'];
        for (const w of moodWords) {
            if (query.includes(w)) return w;
        }
        return '';
    }

    /**
     * Найти сообщения, связанные с подарками/дарением
     * Определить по изменению item.holder или ключевым словам дарения в тексте событий
     */
    _findGiftItems(chat, mentionedChars, excludeIndices, limit) {
        const giftKws = ['赠送', '送给', '收到', '收下', '转赠', '信物', '定情', '礼物', '聘礼', '嫁妆'];
        const results = [];
        const seen = new Set();

        for (let i = chat.length - 1; i >= 0 && results.length < limit; i--) {
            if (excludeIndices.has(i) || seen.has(i)) continue;
            const meta = chat[i].horae_meta;
            if (!meta) continue;

            let matched = false;
            const matchedItems = [];

            if (meta.items) {
                for (const [name, info] of Object.entries(meta.items)) {
                    const imp = info.importance || '';
                    const holder = info.holder || '';
                    const holderMatchesChar = mentionedChars.length === 0 || mentionedChars.some(c => holder.includes(c));

                    if ((imp === '!' || imp === '!!') && holderMatchesChar) {
                        matched = true;
                        matchedItems.push(`${imp === '!!' ? '关键' : '重要'}:${name}`);
                    }
                }
            }

            if (!matched && meta.events) {
                for (const evt of meta.events) {
                    if (evt.isSummary || evt.level === '摘要' || evt._summaryId) continue;
                    const text = evt.summary || '';
                    if (giftKws.some(kw => text.includes(kw))) {
                        if (mentionedChars.length === 0 || mentionedChars.some(c => text.includes(c))) {
                            matched = true;
                            matchedItems.push(text.substring(0, 20));
                        }
                    }
                }
            }

            if (matched) {
                seen.add(i);
                results.push({
                    messageIndex: i,
                    similarity: 0.95,
                    document: `[Структурированный] Подарки: ${matchedItems.join('; ')}`,
                    source: 'structured',
                });
            }
        }
        return results;
    }

    /**
     * Найти сообщения с важными/ключевыми предметами (importance '!' или '!!')
     */
    _findImportantItems(chat, excludeIndices, limit) {
        const results = [];
        for (let i = chat.length - 1; i >= 0 && results.length < limit; i--) {
            if (excludeIndices.has(i)) continue;
            const meta = chat[i].horae_meta;
            if (!meta?.items) continue;

            const importantNames = [];
            for (const [name, info] of Object.entries(meta.items)) {
                if (info.importance === '!' || info.importance === '!!') {
                    importantNames.push(`${info.importance === '!!' ? '★' : '☆'}${info.icon || ''}${name}`);
                }
            }
            if (importantNames.length > 0) {
                results.push({
                    messageIndex: i,
                    similarity: 0.95,
                    document: `[Структурированный] Важные предметы: ${importantNames.join(', ')}`,
                    source: 'structured',
                });
            }
        }
        return results;
    }

    /**
     * Найти события уровня важное/ключевое
     */
    _findImportantEvents(chat, excludeIndices, limit) {
        const results = [];
        for (let i = chat.length - 1; i >= 0 && results.length < limit; i--) {
            if (excludeIndices.has(i)) continue;
            const meta = chat[i].horae_meta;
            if (!meta?.events) continue;

            for (const evt of meta.events) {
                if (evt.isSummary || evt.level === '摘要' || evt._summaryId) continue;
                if (evt.level === '重要' || evt.level === '关键') {
                    results.push({
                        messageIndex: i,
                        similarity: evt.level === '关键' ? 1.0 : 0.95,
                        document: `[Структурированный] ${evt.level}-событие: ${(evt.summary || '').substring(0, 30)}`,
                        source: 'structured',
                    });
                    break;
                }
            }
        }
        return results;
    }

    /**
     * Тематический поиск событий: церемонии/обещания/потери/разоблачения/изменения способностей
     * Точное сопоставление текста событий с TERM_CATEGORIES
     */
    _findThematicEvents(chat, flags, excludeIndices, limit) {
        const activeCategories = [];
        if (flags.ceremony) activeCategories.push('ceremony');
        if (flags.promise) activeCategories.push('promise');
        if (flags.loss) activeCategories.push('loss');
        if (flags.revelation) activeCategories.push('revelation');
        if (flags.power) activeCategories.push('power');

        const searchTerms = new Set();
        for (const cat of activeCategories) {
            if (TERM_CATEGORIES[cat]) {
                for (const t of TERM_CATEGORIES[cat]) searchTerms.add(t);
            }
        }
        if (searchTerms.size === 0) return [];

        const results = [];
        for (let i = chat.length - 1; i >= 0 && results.length < limit; i--) {
            if (excludeIndices.has(i)) continue;
            const meta = chat[i].horae_meta;
            if (!meta?.events) continue;

            for (const evt of meta.events) {
                if (evt.isSummary || evt.level === '摘要' || evt._summaryId) continue;
                const text = evt.summary || '';
                const hits = [...searchTerms].filter(t => text.includes(t));
                if (hits.length > 0) {
                    results.push({
                        messageIndex: i,
                        similarity: 0.90 + Math.min(hits.length, 5) * 0.02,
                        document: `[Структурированный] Тематическое событие(${activeCategories.join('+')}): ${hits.join(',')}`,
                        source: 'structured',
                    });
                    break;
                }
            }
        }
        return results;
    }

    // ========================================
    // Гибридный поиск: вектор + ключевые слова (резервный)
    // ========================================

    async _hybridSearch(userQuery, state, horaeManager, skipLast, settings, excludeIndices, topK, threshold, pureMode = false) {
        if (!this.isReady || this.vectors.size === 0) return [];

        const lastIdx = Math.max(0, horaeManager.getChat().length - 1 - skipLast);
        const lastMeta = horaeManager.getMessageMeta(lastIdx);
        const stateQuery = this.buildStateQuery(state, lastMeta);

        const merged = new Map();

        if (userQuery) {
            const intentThreshold = Math.max(threshold - 0.25, 0.4);
            const intentResults = await this.search(userQuery, topK * 2, intentThreshold, excludeIndices, pureMode);
            console.log(`[Horae Vector] Поиск по намерению: ${intentResults.length} записей`);
            for (const r of intentResults) {
                merged.set(r.messageIndex, { ...r, source: 'intent' });
            }
        }

        if (stateQuery) {
            const stateResults = await this.search(stateQuery, topK * 2, threshold, excludeIndices, pureMode);
            console.log(`[Horae Vector] Поиск по состоянию: ${stateResults.length} записей`);
            for (const r of stateResults) {
                const existing = merged.get(r.messageIndex);
                if (!existing || r.similarity > existing.similarity) {
                    merged.set(r.messageIndex, { ...r, source: existing ? 'both' : 'state' });
                }
            }
        }

        let results = Array.from(merged.values());
        results.sort((a, b) => b.similarity - a.similarity);
        results = this._deduplicateResults(results).slice(0, topK);

        console.log(`[Horae Vector] Результаты гибридного поиска: ${results.length} записей`);
        for (const r of results) {
            console.log(`  #${r.messageIndex} sim=${r.similarity.toFixed(4)} [${r.source}] | ${r.document.substring(0, 80)}`);
        }

        return results;
    }

    _buildRecallText(results, currentDate, chat, fullTextCount = 3, fullTextThreshold = 0.9, stripTags = '') {
        const lines = ['[Воспоминания — ниже исторические фрагменты, связанные с текущей ситуацией, только для справки, не текущий контекст]'];

        for (let rank = 0; rank < results.length; rank++) {
            const r = results[rank];
            const meta = chat[r.messageIndex]?.horae_meta;
            if (!meta) continue;

            const isFullText = fullTextCount > 0 && rank < fullTextCount && r.similarity >= fullTextThreshold;

            if (isFullText) {
                const rawText = this._extractCleanText(chat[r.messageIndex]?.mes, stripTags);
                if (rawText) {
                    const timeTag = this._buildTimeTag(meta?.timestamp, currentDate);
                    lines.push(`#${r.messageIndex} ${timeTag ? timeTag + ' ' : ''}[Полный текст]\n${rawText}`);
                    continue;
                }
            }

            const parts = [];

            const timeTag = this._buildTimeTag(meta?.timestamp, currentDate);
            if (timeTag) parts.push(timeTag);

            if (meta?.scene?.location) parts.push(`Сцена:${meta.scene.location}`);

            const chars = meta?.scene?.characters_present || [];
            const costumes = meta?.costumes || {};
            for (const c of chars) {
                parts.push(costumes[c] ? `${c}(${costumes[c]})` : c);
            }

            if (meta?.events?.length > 0) {
                for (const evt of meta.events) {
                    if (evt.isSummary || evt.level === '摘要') continue;
                    const mark = evt.level === '关键' ? '★' : evt.level === '重要' ? '●' : '○';
                    if (evt.summary) parts.push(`${mark}${evt.summary}`);
                }
            }

            if (meta?.npcs) {
                for (const [name, info] of Object.entries(meta.npcs)) {
                    let s = `NPC:${name}`;
                    if (info.relationship) s += `(${info.relationship})`;
                    parts.push(s);
                }
            }

            if (meta?.items && Object.keys(meta.items).length > 0) {
                for (const [name, info] of Object.entries(meta.items)) {
                    let s = `${info.icon || ''}${name}`;
                    if (info.holder) s += `=${info.holder}`;
                    parts.push(s);
                }
            }

            if (parts.length > 0) {
                lines.push(`#${r.messageIndex} ${parts.join(' | ')}`);
            }
        }

        return lines.length > 1 ? lines.join('\n') : '';
    }

    _extractCleanText(mes, stripTags) {
        if (!mes) return '';
        let text = mes
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '');
        if (stripTags) {
            const tags = stripTags.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean);
            for (const tag of tags) {
                const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                text = text.replace(new RegExp(`<${escaped}(?:\\s[^>]*)?>[\\s\\S]*?</${escaped}>`, 'gi'), '');
            }
        }
        return text.replace(/<[^>]*>/g, '').trim();
    }

    /**
     * Построить метку времени: (относительное время, абсолютная дата, время)
     * Пример: (позавчера Месяц Инея 1-й день 19:10) или (сегодня 07:55)
     */
    _buildTimeTag(timestamp, currentDate) {
        if (!timestamp) return '';

        const storyDate = timestamp.story_date;
        const storyTime = timestamp.story_time;
        const parts = [];

        if (storyDate && currentDate) {
            const relDesc = this._getRelativeTimeDesc(storyDate, currentDate);
            if (relDesc) {
                parts.push(relDesc.replace(/[()]/g, ''));
            }
        }

        if (storyDate) parts.push(storyDate);
        if (storyTime) parts.push(storyTime);

        if (parts.length === 0) return '';

        const combined = parts.join(' ');
        return `(${combined})`;
    }

    _getRelativeTimeDesc(eventDate, currentDate) {
        if (!eventDate || !currentDate) return '';
        const result = calculateDetailedRelativeTime(eventDate, currentDate);
        if (result.days === null || result.days === undefined) return '';

        const { days, fromDate, toDate } = result;
        if (days === 0) return '(сегодня)';
        if (days === 1) return '(вчера)';
        if (days === 2) return '(позавчера)';
        if (days === 3) return '(3 дня назад)';
        if (days >= 4 && days <= 13 && fromDate) {
            const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
            return `(пред. ${WD[fromDate.getDay()]})`;
        }
        if (days >= 20 && days < 60 && fromDate && toDate && fromDate.getMonth() !== toDate.getMonth()) {
            return `(${fromDate.getDate()} пр. мес.)`;
        }
        if (days >= 300 && fromDate && toDate && fromDate.getFullYear() < toDate.getFullYear()) {
            return `(${fromDate.getMonth() + 1} мес. пр. г.)`;
        }
        if (days > 0 && days < 30) return `(${days} дн. назад)`;
        if (days > 0) return `(${Math.round(days / 30)} мес. назад)`;
        return '';
    }

    // ========================================
    // Коммуникация с Worker
    // ========================================

    _embed(texts) {
        if (this.isApiMode) return this._embedApi(texts);
        if (!this.worker) return Promise.resolve(null);
        const id = ++this._callId;
        return new Promise((resolve, reject) => {
            this._pendingCallbacks.set(id, { resolve, reject });
            this.worker.postMessage({ type: 'embed', id, data: { texts } });
            setTimeout(() => {
                if (this._pendingCallbacks.has(id)) {
                    this._pendingCallbacks.delete(id);
                    reject(new Error('Таймаут Embedding'));
                }
            }, 30000);
        });
    }

    async _embedApi(texts) {
        const endpoint = `${this._apiUrl}/embeddings`;
        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this._apiKey}`,
                },
                body: JSON.stringify({
                    model: this._apiModel,
                    input: texts,
                }),
            });
            if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                throw new Error(`API ${resp.status}: ${errText.slice(0, 200)}`);
            }
            const json = await resp.json();
            if (!json.data || !Array.isArray(json.data)) {
                throw new Error('Неверный формат ответа API: отсутствует массив data');
            }
            const vectors = json.data
                .sort((a, b) => a.index - b.index)
                .map(d => d.embedding);
            return { vectors };
        } catch (err) {
            console.error('[Horae Vector] Ошибка API embedding:', err);
            throw err;
        }
    }

    /**
     * Вызов Rerank API (формат, совместимый с Cohere/Jina/Qwen)
     * @returns {Array<{index: number, relevance_score: number}>}
     */
    async _rerank(query, documents, topN, settings) {
        const baseUrl = (settings.vectorRerankUrl || settings.vectorApiUrl || '').replace(/\/+$/, '');
        const apiKey = settings.vectorRerankKey || settings.vectorApiKey || '';
        const model = settings.vectorRerankModel || '';

        if (!baseUrl || !model) throw new Error('Адрес Rerank API или модель не настроены');

        const endpoint = `${baseUrl}/rerank`;
        console.log(`[Horae Vector] Rerank запрос: ${documents.length} кандидатов → ${endpoint}`);

        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                query,
                documents,
                top_n: topN,
            }),
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Rerank API ${resp.status}: ${errText.slice(0, 200)}`);
        }

        const json = await resp.json();
        const results = json.results || json.data;
        if (!Array.isArray(results)) {
            throw new Error('Неверный формат ответа Rerank API: отсутствует массив results');
        }

        return results.map(r => ({
            index: r.index,
            relevance_score: r.relevance_score ?? r.score ?? 0,
        })).sort((a, b) => b.relevance_score - a.relevance_score);
    }

    // ========================================
    // IndexedDB
    // ========================================

    async _openDB() {
        if (this.db) {
            try {
                this.db.transaction(STORE_NAME, 'readonly');
                return;
            } catch (_) {
                console.warn('[Horae Vector] DB connection stale, reconnecting...');
                try { this.db.close(); } catch (__) {}
                this.db = null;
            }
        }
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                    store.createIndex('chatId', 'chatId', { unique: false });
                }
            };
            req.onblocked = () => {
                console.warn('[Horae Vector] DB upgrade blocked by another tab, closing old connection');
            };
            req.onsuccess = () => {
                this.db = req.result;
                this.db.onversionchange = () => {
                    this.db.close();
                    this.db = null;
                    console.log('[Horae Vector] DB closed due to version change in another tab');
                };
                this.db.onclose = () => { this.db = null; };
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

    async _saveVector(messageIndex, data) {
        await this._openDB();
        const key = `${this.chatId}_${messageIndex}`;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put({
                key,
                chatId: this.chatId,
                messageIndex,
                vector: data.vector,
                hash: data.hash,
                document: data.document,
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async _loadAllVectors() {
        await this._openDB();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readonly');
            const index = tx.objectStore(STORE_NAME).index('chatId');
            const req = index.getAll(this.chatId);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async _deleteVector(messageIndex) {
        await this._openDB();
        const key = `${this.chatId}_${messageIndex}`;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async _clearVectors() {
        await this._openDB();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('chatId');
            const req = index.openCursor(this.chatId);
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    // ========================================
    // Утилиты
    // ========================================

    _hasOriginalEvents(meta) {
        if (!meta?.events?.length) return false;
        return meta.events.some(e => !e.isSummary && e.level !== '摘要' && !e._summaryId);
    }

    _dotProduct(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        let sum = 0;
        for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
        return sum;
    }

    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }

    _extractKeyTerms(document) {
        return document
            .split(/[\s|,，。！？：；、()\[\]（）\n]+/)
            .filter(t => t.length >= 2 && t.length <= 20);
    }

    _updateTermCounts(document, delta) {
        const terms = this._extractKeyTerms(document);
        const unique = new Set(terms);
        for (const term of unique) {
            const prev = this.termCounts.get(term) || 0;
            const next = prev + delta;
            if (next <= 0) this.termCounts.delete(term);
            else this.termCounts.set(term, next);
        }
    }

    _prepareText(text, isQuery) {
        const cfg = MODEL_CONFIG[this.modelName];
        if (cfg?.prefix) {
            return isQuery ? `${cfg.prefix.query}${text}` : `${cfg.prefix.passage}${text}`;
        }
        return text;
    }
}

export const vectorManager = new VectorManager();
