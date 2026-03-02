document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('input-text');
    const outputText = document.getElementById('output-text');
    const processBtn = document.getElementById('process-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const stats = document.getElementById('stats');
    const replacementsCount = document.getElementById('replacements-count');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');


    /**
     * Detecta si un texto es un item visual (descripción de contenido visual).
     */
    function isVisualItem(text) {
        const t = text.trim();
        if (!t) return false;
        // Viñetas explícitas
        if (/^[●•\*▸▹‣►→◦‐–—]\s/.test(t)) return true;
        // Keywords de contenido visual
        if (/^(Fotos?|Im[aá]gen(es)?|Mapa(s)?|Recortes?|Fichas?|Cronolog[ií]as?|Infograf[ií]as?|Extractos?|Luz|Transici[oó]n(es)?|Videos?|Clips?|Gr[aá]ficos?|Diagramas?|Capturas?|Ilustraci[oó]n(es)?|Montajes?|Secuencias?|Portadas?|Collages?|Bocetos?|Planos?|Animaci[oó]n(es)?|Escenas?|Tomas?|Titular(es)?|Fechas?|Referencias?|Citas?|Cortes?|Pantallas?|Textos?)\b/i.test(t)) return true;
        return false;
    }

    /**
     * Elimina bloques de sugerencias visuales del HTML.
     * Normaliza la estructura HTML, recorre el DOM recursivamente,
     * y detecta elementos <li> como items removibles después del trigger.
     * Funciona con cualquier estructura: div, p, li, br, spans, texto plano.
     */
    function removeVisualSuggestions(html) {
        let count = 0;
        const detectionLog = [];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // PASO 1: Normalizar HTML - cada "línea" debe ser su propio elemento
        function normalize(container) {
            const children = Array.from(container.childNodes);
            for (const child of children) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const tag = child.tagName.toLowerCase();
                    if (tag === 'br') continue;
                    // Si contiene <br> pero NO bloques anidados, dividir en elementos separados
                    if (child.querySelector('br') && !child.querySelector('div, p, li, ul, ol, table')) {
                        const parts = child.innerHTML.split(/<br\s*\/?>/i);
                        if (parts.length > 1) {
                            const frag = document.createDocumentFragment();
                            for (const part of parts) {
                                if (part.trim()) {
                                    const newTag = (tag === 'span') ? 'div' : tag;
                                    const el = document.createElement(newTag);
                                    for (const attr of child.attributes) {
                                        el.setAttribute(attr.name, attr.value);
                                    }
                                    el.innerHTML = part.trim();
                                    frag.appendChild(el);
                                }
                            }
                            child.replaceWith(frag);
                            continue;
                        }
                    }
                    normalize(child);
                } else if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent;
                    if (text.includes('\n') && text.trim().length > 0) {
                        const parts = text.split('\n');
                        if (parts.filter(p => p.trim()).length > 1) {
                            const frag = document.createDocumentFragment();
                            for (const part of parts) {
                                if (part.trim()) {
                                    const div = document.createElement('div');
                                    div.textContent = part;
                                    frag.appendChild(div);
                                }
                            }
                            child.replaceWith(frag);
                        }
                    }
                }
            }
        }
        normalize(tempDiv);

        // PASO 2: Obtener todos los "bloques hoja" recursivamente
        function getLeafBlocks(container) {
            const leaves = [];
            function walk(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName.toLowerCase();
                    const isBlock = ['div', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'td'].includes(tag);
                    if (tag === 'li') {
                        leaves.push(node); // <li> siempre es hoja
                        return;
                    }
                    const hasNestedBlocks = isBlock && node.querySelector('div, p, li, ul, ol, h1, h2, h3, h4, h5, h6, table');
                    if (isBlock && !hasNestedBlocks) {
                        leaves.push(node);
                    } else {
                        for (const ch of node.childNodes) walk(ch);
                    }
                } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    leaves.push(node);
                }
            }
            for (const ch of container.childNodes) walk(ch);
            return leaves;
        }

        const leaves = getLeafBlocks(tempDiv);
        const nodesToRemove = [];
        let afterTrigger = false;

        // PASO 3: Identificar trigger + items
        for (const leaf of leaves) {
            const text = (leaf.textContent || '').trim();

            // Trigger: 🎬 [SUGERENCIAS VISUALES...]
            if (text.includes('🎬') && /SUGERENCIAS?\s+VISUALES?/i.test(text)) {
                count++;
                nodesToRemove.push(leaf);
                afterTrigger = true;
                detectionLog.push({ type: 'visual-block', label: '🎬 Bloque de sugerencias visuales', detail: text.slice(0, 80) });
                continue;
            }

            // Marcadores de inserción: 📰/📹/📸 [INSERTAR ...]
            if (/[\u{1F4F0}\u{1F4F9}\u{1F4F8}\u{1F3AC}\u{1F4FA}\u{1F4F7}\u{1F3A5}\u{1F3A4}\u{1F399}]\s*\[INSERTAR\b/u.test(text)) {
                nodesToRemove.push(leaf);
                detectionLog.push({ type: 'insertar', label: '📌 Marcador [INSERTAR]', detail: text.slice(0, 80) });
                continue;
            }

            // Referencia/fuente general: emoji [TIPO: contenido] metadatos...
            // Detecta: 📰 [ARTÍCULO: ...], 📹 [DOCUMENTAL: ...], 🎤 [DECLARACIÓN: ...], 📰 [LIBRO: ...], etc.
            if (/[\u{1F4F0}\u{1F4F9}\u{1F4F8}\u{1F3AC}\u{1F4FA}\u{1F4F7}\u{1F3A5}\u{1F3A4}\u{1F399}]\s*\[[^\]]*:/u.test(text)) {
                nodesToRemove.push(leaf);
                detectionLog.push({ type: 'referencia', label: '📎 Referencia/Fuente', detail: text.slice(0, 80) });
                continue;
            }

            if (afterTrigger) {
                const isLi = leaf.nodeType === Node.ELEMENT_NODE && leaf.tagName === 'LI';
                if (isLi || isVisualItem(text)) {
                    nodesToRemove.push(leaf);
                    detectionLog.push({ type: 'visual-item', label: '  ↳ Item visual eliminado', detail: text.slice(0, 80) });
                    continue;
                }
            }
            // Primera línea que NO es item → parar
            if (text) afterTrigger = false;
        }

        // PASO 4: Eliminar nodos y limpiar contenedores vacíos
        nodesToRemove.forEach(node => {
            const parent = node.parentNode;
            node.remove();
            // Limpiar <ul>/<ol> vacíos
            if (parent && ['UL', 'OL'].includes(parent.tagName) && parent.children.length === 0) {
                parent.remove();
            }
        });

        let processedHTML = tempDiv.innerHTML;
        processedHTML = processedHTML.replace(/<(div|p|li)(\s[^>]*)?>(\s*(<br\s*\/?>)?\s*)<\/\1>/gi, '');
        processedHTML = processedHTML.replace(/(<br\s*\/?>){3,}/gi, '<br><br>');

        return { html: processedHTML, blocksRemoved: count, detectionLog };
    }


    function processHTML(html) {
        // Regex para capturar el patrón <<<MUTEAR: X → DECIR: Y>>>
        // Funciona tanto en texto plano como dentro de HTML
        // Maneja casos donde el marcador puede estar dividido por tags HTML
        const pattern = /&lt;&lt;&lt;MUTEAR:\s*([^→]+)→\s*DECIR:\s*([^&]+)&gt;&gt;&gt;/g;
        const patternPlain = /<<<MUTEAR:\s*([^→]+)→\s*DECIR:\s*([^>]+)>>>/g;

        let count = 0;
        let resourcesRemoved = 0;
        let sectionsRemoved = 0;
        let searchMarkersRemoved = 0;
        const detectionLog = [];

        // Primero intentar con entidades HTML escapadas
        let processedHTML = html.replace(pattern, (match, mutearValue, decirValue) => {
            count++;
            detectionLog.push({
                type: 'mutear',
                label: '🔄 MUTEAR → DECIR',
                detail: `"${mutearValue.trim()}" → "${decirValue.trim()}"`
            });
            return decirValue.trim();
        });

        // Luego con caracteres normales (por si el texto se pegó de cierta manera)
        processedHTML = processedHTML.replace(patternPlain, (match, mutearValue, decirValue) => {
            count++;
            detectionLog.push({
                type: 'mutear',
                label: '🔄 MUTEAR → DECIR',
                detail: `"${mutearValue.trim()}" → "${decirValue.trim()}"`
            });
            return decirValue.trim();
        });

        // Eliminar marcadores de recursos: 📰/📹/📸 [RECURSO - ...]
        // Captura desde el emoji hasta el cierre del corchete ]
        const resourcePattern = /[\u{1F4F0}\u{1F4F9}\u{1F4F8}\u{1F3AC}\u{1F4FA}\u{1F4F7}\u{1F3A5}\u{1F3A4}\u{1F399}]\s*\[RECURSO\s*-\s*([^\]]*)\]/gu;
        processedHTML = processedHTML.replace(resourcePattern, (match, content) => {
            resourcesRemoved++;
            detectionLog.push({
                type: 'recurso',
                label: '📦 Marcador [RECURSO]',
                detail: content.trim().slice(0, 80)
            });
            return '';
        });

        // Eliminar referencias generales: emoji [TIPO: contenido] metadatos en la misma línea
        // Cubre: [ARTÍCULO: ...], [LIBRO: ...], [DOCUMENTAL: ...], [DECLARACIÓN: ...], [INSERTAR ...], etc.
        let refsRemoved = 0;
        const refPattern = /[\u{1F4F0}\u{1F4F9}\u{1F4F8}\u{1F3AC}\u{1F4FA}\u{1F4F7}\u{1F3A5}\u{1F3A4}\u{1F399}]\s*\[[^\]]*\][^<\n]*/gu;
        processedHTML = processedHTML.replace(refPattern, (match) => {
            refsRemoved++;
            detectionLog.push({
                type: 'referencia',
                label: '📎 Referencia/Fuente',
                detail: match.trim().slice(0, 80)
            });
            return '';
        });

        // Eliminar marcadores de sección: SECCIÓN: TEXTO
        const sectionPattern = /SECCIÓN:\s*([^\n<]*)/g;
        processedHTML = processedHTML.replace(sectionPattern, (match, content) => {
            sectionsRemoved++;
            detectionLog.push({
                type: 'seccion',
                label: '📂 Marcador SECCIÓN',
                detail: content.trim().slice(0, 80)
            });
            return '';
        });

        // Eliminar metadatos sueltos: MEDIO, FECHA, AUTOR, PLATAFORMA, AÑO, FUENTE, BUSCAR EN, TÉRMINOS DE BÚSQUEDA
        // Acepta valores entre corchetes, entre comillas, o texto libre hasta fin de línea/tag
        const searchPattern = /(BUSCAR EN|TÉRMINOS DE BÚS?QUEDA|MEDIO|FECHA|AUTOR|PLATAFORMA|AÑO|FUENTE):\s*("(?:[^"\\]|\\.)*"|\[[^\]]*\]|[^<\n]+)/g;
        processedHTML = processedHTML.replace(searchPattern, (match, keyword, content) => {
            searchMarkersRemoved++;
            detectionLog.push({
                type: 'busqueda',
                label: `🔍 Marcador ${keyword}`,
                detail: content.trim().slice(0, 80)
            });
            return '';
        });

        // Eliminar bloques de sugerencias visuales
        const visualResult = removeVisualSuggestions(processedHTML);
        processedHTML = visualResult.html;

        return {
            html: processedHTML,
            replacements: count,
            blocksRemoved: visualResult.blocksRemoved,
            resourcesRemoved: resourcesRemoved + refsRemoved,
            sectionsRemoved: sectionsRemoved,
            searchMarkersRemoved: searchMarkersRemoved,
            detectionLog: [...detectionLog, ...visualResult.detectionLog]
        };
    }

    /**
     * Muestra una notificación toast
     * @param {string} message - Mensaje a mostrar
     */
    function showToast(message) {
        toastMessage.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    /**
     * Maneja el evento de procesar texto
     */
    function handleProcess() {
        const inputHTML = inputText.innerHTML.trim();

        if (!inputHTML || inputHTML === '<br>') {
            showToast('⚠️ Por favor, ingresa texto para procesar');
            return;
        }

        // Añadir animación de procesamiento
        outputText.classList.add('processing');

        const result = processHTML(inputHTML);

        outputText.innerHTML = result.html;
        replacementsCount.textContent = result.replacements;

        // Actualizar contador de bloques visuales eliminados
        const blocksCountEl = document.getElementById('blocks-count');
        if (blocksCountEl) {
            blocksCountEl.textContent = result.blocksRemoved;
        }

        // Mostrar estadísticas
        stats.style.display = 'flex';

        // Habilitar botón de copiar
        copyBtn.disabled = false;

        // Remover animación
        setTimeout(() => {
            outputText.classList.remove('processing');
        }, 500);

        // Mostrar log de detecciones
        const logEl = document.getElementById('detection-log');
        const logListEl = document.getElementById('detection-log-list');
        if (logEl && logListEl) {
            if (result.detectionLog.length > 0) {
                logListEl.innerHTML = result.detectionLog.map(item => {
                    const typeClass = `log-${item.type}`;
                    const detail = item.detail ? `<span class="log-detail">${item.detail}</span>` : '';
                    return `<li class="log-item ${typeClass}"><span class="log-label">${item.label}</span>${detail}</li>`;
                }).join('');
                logEl.style.display = 'block';
            } else {
                logEl.style.display = 'none';
            }
        }

        const totalChanges = result.replacements + result.blocksRemoved + result.resourcesRemoved + result.sectionsRemoved + result.searchMarkersRemoved;
        if (totalChanges > 0) {
            let msg = '✅ ';
            const parts = [];
            if (result.replacements > 0) parts.push(`${result.replacements} reemplazo(s)`);
            if (result.blocksRemoved > 0) parts.push(`${result.blocksRemoved} bloque(s) visual(es) eliminado(s)`);
            if (result.resourcesRemoved > 0) parts.push(`${result.resourcesRemoved} recurso(s) eliminado(s)`);
            if (result.sectionsRemoved > 0) parts.push(`${result.sectionsRemoved} sección(es) eliminada(s)`);
            if (result.searchMarkersRemoved > 0) parts.push(`${result.searchMarkersRemoved} marcador(es) de búsqueda eliminado(s)`);
            msg += parts.join(' | ');
            showToast(msg);
        } else {
            showToast('ℹ️ No se encontraron marcadores ni bloques visuales');
        }
    }

    /**
     * Limpia todos los campos
     */
    function handleClear() {
        inputText.innerHTML = '';
        outputText.innerHTML = '';
        stats.style.display = 'none';
        copyBtn.disabled = true;
        replacementsCount.textContent = '0';
        const logEl = document.getElementById('detection-log');
        if (logEl) logEl.style.display = 'none';
        showToast('🗑️ Campos limpiados');
    }

    /**
     * Copia el resultado al portapapeles manteniendo el formato
     */
    function handleCopy() {
        const text = outputText.innerText;

        if (!text.trim()) {
            showToast('⚠️ No hay texto para copiar');
            return;
        }

        // Crear un elemento temporal con fondo transparente para copiar
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = outputText.innerHTML;
        tempDiv.style.cssText = 'position:fixed;left:-9999px;background:transparent;';

        // Remover background-color de todos los elementos internos
        const allElements = tempDiv.querySelectorAll('*');
        allElements.forEach(el => {
            el.style.backgroundColor = 'transparent';
            el.style.background = 'transparent';
        });

        document.body.appendChild(tempDiv);

        // Seleccionar y copiar desde el elemento temporal
        const range = document.createRange();
        range.selectNodeContents(tempDiv);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        try {
            const success = document.execCommand('copy');
            if (success) {
                showToast('📋 Copiado con formato al portapapeles');
            } else {
                showToast('❌ Error al copiar. Selecciona manualmente con Ctrl+A y Ctrl+C');
            }
        } catch (err) {
            showToast('❌ Error al copiar. Selecciona manualmente con Ctrl+A y Ctrl+C');
        }

        // Limpiar
        selection.removeAllRanges();
        document.body.removeChild(tempDiv);
    }

    // Event Listeners
    processBtn.addEventListener('click', handleProcess);
    clearBtn.addEventListener('click', handleClear);
    copyBtn.addEventListener('click', handleCopy);

    // Procesar con Ctrl+Enter o Cmd+Enter
    inputText.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleProcess();
        }
    });

    // Manejar placeholder para contenteditable
    function updatePlaceholder(element) {
        if (element.innerHTML.trim() === '' || element.innerHTML === '<br>') {
            element.classList.add('empty');
        } else {
            element.classList.remove('empty');
        }
    }

    inputText.addEventListener('input', () => updatePlaceholder(inputText));
    inputText.addEventListener('focus', () => updatePlaceholder(inputText));
    inputText.addEventListener('blur', () => updatePlaceholder(inputText));

    // Inicializar placeholders
    updatePlaceholder(inputText);
    updatePlaceholder(outputText);
});
