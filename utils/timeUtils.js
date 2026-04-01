/** Horae — Утилиты для работы со временем */

/** Названия дней недели */
const WEEKDAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** Названия сезонов по месяцам (индекс = номер месяца 0–11) */
const SEASONS = ['зима', 'зима', 'весна', 'весна', 'весна', 'лето', 'лето', 'лето', 'осень', 'осень', 'осень', 'зима'];

/** Маппинг китайских числительных (нужен для парсинга фэнтезийных дат из ответа ИИ) */
const CHINESE_NUMS = {
    '零': 0, '〇': 0,
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
    '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
    '廿': 20, '廿一': 21, '廿二': 22, '廿三': 23, '廿四': 24, '廿五': 25,
    '廿六': 26, '廿七': 27, '廿八': 28, '廿九': 29, '三十': 30,
    '三十一': 31, '卅': 30, '卅一': 31
};

/** Извлечь номер дня из строки даты */
function extractDayNumber(dateStr) {
    if (!dateStr) return null;
    
    const arabicMatch = dateStr.match(/(?:第|Day\s*|day\s*)(\d+)(?:日)?/i) ||
                       dateStr.match(/(\d+)(?:日|号)/);
    if (arabicMatch) return parseInt(arabicMatch[1]);
    
    // Поиск по китайским числительным
    const sortedEntries = Object.entries(CHINESE_NUMS).sort((a, b) => b[0].length - a[0].length);
    
    for (const [cn, num] of sortedEntries) {
        const patterns = [
            new RegExp(`第${cn}日`),
            new RegExp(`第${cn}(?![\u4e00-\u9fa5])`),  // 第X — после не идёт иероглиф
            new RegExp(`[月]${cn}日`),
            new RegExp(`${cn}日`)
        ];
        
        for (const pattern of patterns) {
            if (pattern.test(dateStr)) {
                return num;
            }
        }
    }
    
    const anyNumMatch = dateStr.match(/(\d+)/);
    if (anyNumMatch) return parseInt(anyNumMatch[1]);
    
    return null;
}

/** Извлечь идентификатор месяца из строки даты */
function extractMonthIdentifier(dateStr) {
    if (!dateStr) return null;
    
    // Формат «X月» (X-й месяц)
    const monthMatch = dateStr.match(/([^\s\d]+月)/);
    if (monthMatch) return monthMatch[1];
    
    const numMatch = dateStr.match(/(?:\d{4}[\/\-])?(\d{1,2})[\/\-]\d{1,2}/);
    if (numMatch) return numMatch[1] + '月';
    
    return null;
}

/** Разобрать строку даты сюжета */
export function parseStoryDate(dateStr) {
    if (!dateStr) return null;
    
    // Очистить пометку дня недели от ИИ
    let cleanStr = dateStr.trim();
    
    const aiWeekdayMatch = cleanStr.match(/\(([日一二三四五六])\)/); 
    cleanStr = cleanStr.replace(/\s*\([日一二三四五六]\)\s*/g, ' ').trim();
    
    // Невалидная дата → обработать как фэнтезийный календарь
    if (/[xX]{2}|[?？]{2}/.test(cleanStr)) {
        return { 
            type: 'fantasy',
            raw: dateStr.trim(),
            aiWeekday: aiWeekdayMatch ? aiWeekdayMatch[1] : undefined
        };
    }
    
    // Стандартный числовой формат
    const fullMatch = cleanStr.match(/^(\d{4,})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (fullMatch) {
        const year = parseInt(fullMatch[1]);
        const month = parseInt(fullMatch[2]);
        const day = parseInt(fullMatch[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return { year, month, day, type: 'standard' };
        }
    }
    
    const shortMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})(?:\s|$)/);
    if (shortMatch) {
        const month = parseInt(shortMatch[1]);
        const day = parseInt(shortMatch[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return { month, day, type: 'standard' };
        }
    }
    
    // Формат X年M月D日 (X г. M мес. D дн.)
    // Должен идти до чистого X月X日, иначе год потеряется
    const yearCnMatch = cleanStr.match(/(\d+)年\s*(\d{1,2})月(\d{1,2})日?/);
    if (yearCnMatch) {
        const year = parseInt(yearCnMatch[1]);
        const month = parseInt(yearCnMatch[2]);
        const day = parseInt(yearCnMatch[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            // Извлечь префикс календарной системы
            const fullMatchStr = yearCnMatch[0];
            const prefixEnd = cleanStr.indexOf(fullMatchStr);
            const calendarPrefix = cleanStr.substring(0, prefixEnd).trim() || undefined;
            return { year, month, day, type: 'standard', calendarPrefix };
        }
    }
    
    // Формат X月X日 (X мес. X дн.)
    const cnMatch = cleanStr.match(/(\d{1,2})月(\d{1,2})日?/);
    if (cnMatch) {
        const month = parseInt(cnMatch[1]);
        const day = parseInt(cnMatch[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return { month, day, type: 'standard' };
        }
    }
    
    // Фэнтезийный календарь
    const monthId = extractMonthIdentifier(cleanStr);
    const dayNum = extractDayNumber(cleanStr);
    
    if (monthId || dayNum !== null) {
        return { 
            monthId: monthId,
            day: dayNum,
            type: 'fantasy',
            raw: dateStr.trim(),
            aiWeekday: aiWeekdayMatch ? aiWeekdayMatch[1] : undefined
        };
    }
    
    return null;
}

/** Вычислить разницу в днях между двумя датами */
export function calculateRelativeTime(fromDate, toDate) {
    if (!fromDate || !toDate) return null;
    
    const fromDateOnly = fromDate.split(/\s+/)[0].trim();
    const toDateOnly = toDate.split(/\s+/)[0].trim();
    
    if (fromDateOnly === toDateOnly) {
        return 0;
    }
    
    const from = parseStoryDate(fromDate);
    const to = parseStoryDate(toDate);
    
    if (!from || !to) return null;
    
    // Стандартный формат — точное вычисление
    if (from.type === 'standard' && to.type === 'standard') {
        const defaultYear = 2024;
        const fromYear = from.year || to.year || defaultYear;
        const toYear = to.year || from.year || defaultYear;
        
        const fromObj = new Date(0);
        fromObj.setFullYear(fromYear, from.month - 1, from.day);
        const toObj = new Date(0);
        toObj.setFullYear(toYear, to.month - 1, to.day);
        
        const diffTime = toObj.getTime() - fromObj.getTime();
        return Math.round(diffTime / (1000 * 60 * 60 * 24));
    }
    
    if (from.type === 'fantasy' || to.type === 'fantasy') {
        const fromDay = from.day;
        const toDay = to.day;
        const fromMonth = from.monthId || from.month;
        const toMonth = to.monthId || to.month;
        
        // Один месяц — точное вычисление
        if (fromMonth && toMonth && fromMonth === toMonth && 
            fromDay !== null && toDay !== null) {
            return toDay - fromDay;
        }
        
        // Разные месяцы — оценка
        if (fromDay !== null && toDay !== null) {
            if (fromMonth && toMonth && fromMonth !== toMonth) {
                return toDay > fromDay ? -998 : -997; // -998=после, -997=до
            }
            return toDay - fromDay;
        }
        
        return -999;
    }
    
    return null;
}

/** Форматировать описание относительного времени */
export function formatRelativeTime(days, options = {}) {
    if (days === null || days === undefined) return 'неизвестно';
    
    if (days === -999) return 'ранее';
    if (days === -998) return 'после';
    if (days === -997) return 'до';
    
    // Ближайшие дни
    if (days === 0) return 'Сегодня';
    if (days === 1) return 'Вчера';
    if (days === 2) return 'Позавчера';
    if (days === 3) return '3 дня назад';
    if (days === -1) return 'Завтра';
    if (days === -2) return 'Послезавтра';
    if (days === -3) return 'Через 3 дня';
    
    const { fromDate, toDate } = options;
    
    if (days > 0) {
        if (days < 7) return `${days} дн. назад`;
        
        // Прошлая неделя
        if (days >= 4 && days <= 13 && fromDate) {
            const weekday = fromDate.getDay();
            return `пред. ${WEEKDAY_NAMES[weekday]}`;
        }
        
        // Прошлый месяц
        if (days >= 20 && days < 60 && fromDate && toDate) {
            const fromMonth = fromDate.getMonth();
            const toMonth = toDate.getMonth();
            if (fromMonth !== toMonth) {
                return `${fromDate.getDate()} пред. мес.`;
            }
        }
        
        if (days >= 300 && fromDate && toDate) {
            const fromYear = fromDate.getFullYear();
            const toYear = toDate.getFullYear();
            if (fromYear < toYear) {
                const fromMonth = fromDate.getMonth() + 1;
                const fromDay = fromDate.getDate();
                if (days < 730) {
                    return `${fromDay}.${fromMonth} пр. г.`;
                }
            }
        }
        
        if (days < 14) return `${Math.ceil(days / 7)} нед. назад`;
        if (days < 60) return `${Math.round(days / 30)} мес. назад`;
        if (days < 365) return `${Math.round(days / 30)} мес. назад`;
        const years = Math.floor(days / 365);
        const remainMonths = Math.round((days % 365) / 30);
        if (remainMonths > 0 && years < 5) return `${years} г. ${remainMonths} мес. назад`;
        return `${years} г. назад`;
    } else {
        const absDays = Math.abs(days);
        if (absDays < 7) return `через ${absDays} дн.`;
        
        if (absDays >= 4 && absDays <= 13 && fromDate) {
            const weekday = fromDate.getDay();
            return `след. ${WEEKDAY_NAMES[weekday]}`;
        }
        
        if (absDays >= 20 && absDays < 60 && fromDate && toDate) {
            const fromMonth = fromDate.getMonth();
            const toMonth = toDate.getMonth();
            if (fromMonth !== toMonth) {
                return `${fromDate.getDate()} след. мес.`;
            }
        }
        
        if (absDays < 14) return `через ${Math.ceil(absDays / 7)} нед.`;
        if (absDays < 60) return `через ${Math.round(absDays / 30)} мес.`;
        if (absDays < 365) return `через ${Math.round(absDays / 30)} мес.`;
        const years = Math.floor(absDays / 365);
        const remainMonths = Math.round((absDays % 365) / 30);
        if (remainMonths > 0 && years < 5) return `через ${years} г. ${remainMonths} мес.`;
        return `через ${years} г.`;
    }
}

/** Форматировать дату сюжета в стандартный вид */
export function formatStoryDate(dateObj, includeWeekday = false) {
    if (!dateObj) return '';
    // Фэнтезийный календарь — сохранить исходную строку
    if (dateObj.raw && !dateObj.month) {
        let result = dateObj.raw;
        if (includeWeekday && dateObj.aiWeekday && !result.includes(`(${dateObj.aiWeekday})`)) {
            result += ` (${dateObj.aiWeekday})`;
        }
        return result;
    }
    
    let dateStr = '';
    const prefix = dateObj.calendarPrefix || '';
    
    if (dateObj.year) {
        if (prefix) {
            // Сохранить префикс календарной системы
            dateStr = `${prefix}${dateObj.year}年${dateObj.month}月${dateObj.day}日`;
        } else {
            dateStr = `${dateObj.year}/${dateObj.month}/${dateObj.day}`;
        }
    } else if (dateObj.month && dateObj.day) {
        dateStr = `${dateObj.month}/${dateObj.day}`;
    }
    
    if (includeWeekday && dateObj.month && dateObj.day) {
        const refYear = dateObj.year || new Date().getFullYear();
        // setFullYear — чтобы избежать автоматического сдвига года
        const date = new Date(0);
        date.setFullYear(refYear, dateObj.month - 1, dateObj.day);
        const weekday = WEEKDAY_NAMES[date.getDay()];
        dateStr += ` (${weekday})`;
    }
    
    return dateStr;
}

/** Форматировать полную дату и время сюжета */
export function formatFullDateTime(dateStr, timeStr) {
    const parsed = parseStoryDate(dateStr);
    if (!parsed) return dateStr + (timeStr ? ' ' + timeStr : '');
    
    const dateWithWeekday = formatStoryDate(parsed, true);
    return dateWithWeekday + (timeStr ? ' ' + timeStr : '');
}

/** Получить текущее системное время */
export function getCurrentSystemTime() {
    const now = new Date();
    return {
        date: `${now.getMonth() + 1}/${now.getDate()}`,
        time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
    };
}

/** Сгенерировать справочную информацию о времени */
export function generateTimeReference(currentDate) {
    const current = parseStoryDate(currentDate);
    if (!current) return null;
    
    if (current.type === 'fantasy') {
        return {
            current: currentDate,
            type: 'fantasy',
            note: 'Режим фэнтезийного календаря, относительные даты вычисляются плагином автоматически'
        };
    }
    
    const refYear = current.year || new Date().getFullYear();
    const baseDate = new Date(0);
    baseDate.setFullYear(refYear, current.month - 1, current.day);
    
    const getDateString = (daysOffset) => {
        const d = new Date(baseDate.getTime());
        d.setDate(d.getDate() + daysOffset);
        const weekday = WEEKDAY_NAMES[d.getDay()];
        return `${d.getMonth() + 1}/${d.getDate()} (${weekday})`;
    };
    
    return {
        current: currentDate,
        type: 'standard',
        yesterday: getDateString(-1),
        dayBefore: getDateString(-2),
        threeDaysAgo: getDateString(-3),
        tomorrow: getDateString(1)
    };
}

/** Вычислить подробную разницу между двумя датами */
export function calculateDetailedRelativeTime(fromDateStr, toDateStr) {
    const days = calculateRelativeTime(fromDateStr, toDateStr);
    if (days === null) return { days: null, relative: 'неизвестно' };
    
    const from = parseStoryDate(fromDateStr);
    const to = parseStoryDate(toDateStr);
    
    let fromDate = null;
    let toDate = null;
    
    if (from?.type === 'standard' && to?.type === 'standard') {
        const defaultYear = new Date().getFullYear();
        const fromYear = from.year || to.year || defaultYear;
        const toYear = to.year || from.year || defaultYear;
        fromDate = new Date(0);
        fromDate.setFullYear(fromYear, from.month - 1, from.day);
        toDate = new Date(0);
        toDate.setFullYear(toYear, to.month - 1, to.day);
    }
    
    const relative = formatRelativeTime(days, { fromDate, toDate });
    
    return { days, fromDate, toDate, relative };
}

/** Вычесть указанное количество дней из даты */
export function subtractDays(dateStr, days) {
    const parsed = parseStoryDate(dateStr);
    if (!parsed || parsed.type === 'fantasy') return dateStr;
    
    const refYear = parsed.year || 2024;
    const date = new Date(0);
    date.setFullYear(refYear, parsed.month - 1, parsed.day);
    date.setDate(date.getDate() - days);
    
    if (parsed.year) {
        return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    }
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** Двенадцать земных ветвей → начальный час (初=первый час, 正=второй час) */
const EARTHLY_BRANCH_HOURS = {
    '子': 23, '丑': 1, '寅': 3, '卯': 5,
    '辰': 7, '巳': 9, '午': 11, '未': 13,
    '申': 15, '酉': 17, '戌': 19, '亥': 21
};

/** Получить описание времени суток */
export function getTimeOfDay(timeStr) {
    if (!timeStr) return '';
    
    let hour = null;
    
    const match24 = timeStr.match(/(\d{1,2})[:：]/);
    if (match24) {
        hour = parseInt(match24[1]);
    }
    
    // Распознавание китайских обозначений времени суток (для совместимости с ответами ИИ)
    const matchCN = timeStr.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|深夜)/);
    if (matchCN) {
        // Возвращаем русский эквивалент
        const cnToRu = {
            '凌晨': 'ночь', '早上': 'раннее утро', '上午': 'утро',
            '中午': 'полдень', '下午': 'день', '傍晚': 'вечер',
            '晚上': 'вечер', '深夜': 'глубокая ночь'
        };
        return cnToRu[matchCN[1]] || matchCN[1];
    }
    
    // Двенадцать земных ветвей (子丑寅卯辰巳午未申酉戌亥 + опциональное "时"/"初"/"正")
    if (hour === null) {
        const branchMatch = timeStr.match(/([子丑寅卯辰巳午未申酉戌亥])时?(?:初|正)?/);
        if (branchMatch) {
            const base = EARTHLY_BRANCH_HOURS[branchMatch[0].charAt(0)];
            if (base !== undefined) {
                hour = /正/.test(branchMatch[0]) ? (base + 1) % 24 : base;
            }
        }
    }
    
    if (hour !== null) {
        if (hour >= 0 && hour < 5) return 'ночь';
        if (hour >= 5 && hour < 8) return 'раннее утро';
        if (hour >= 8 && hour < 11) return 'утро';
        if (hour >= 11 && hour < 13) return 'полдень';
        if (hour >= 13 && hour < 17) return 'день';
        if (hour >= 17 && hour < 19) return 'вечер';
        if (hour >= 19 && hour < 23) return 'вечер';
        return 'глубокая ночь';
    }
    
    return '';
}
