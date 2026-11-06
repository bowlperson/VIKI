/* The phone-first shell shares the existing app controls and data paths. */
(function (root) {
    'use strict';
    const KEY = 'viki_appearance_v1';
    const THEMES = {
        mint: {accent:'#5ce8bf', background:'#091311', text:'#e2eeea', secondary:'#e9bd70'},
        violet: {accent:'#c7a0ff', background:'#100d1a', text:'#f1eafa', secondary:'#72dfdf'},
        amber: {accent:'#ffc46e', background:'#17110b', text:'#f5ecd9', secondary:'#90dfb0'}
    };
    const FONTS = {system:'system-ui, -apple-system, sans-serif', mono:'ui-monospace, "Cascadia Code", "DejaVu Sans Mono", monospace', serif:'Georgia, "Noto Serif", serif', readable:'Verdana, "DejaVu Sans", sans-serif'};
    const DEFAULTS = {theme:'mint', accent:'#5ce8bf', background:'#091311', text:'#e2eeea', font:'system', scale:1, reducedMotion:false, fullscreen:true};
    let initialized = false, previousView = 'chat', activeCategory = 'appearance';
    const $ = id => document.getElementById(id);
    function readAppearance() {
        try { const saved=localStorage.getItem(KEY);const initial={...DEFAULTS};if(!saved&&root.VikiNative?.fullscreenStatus)initial.fullscreen=Boolean(root.VikiNative.fullscreenStatus());return {...initial, ...JSON.parse(saved || '{}')}; }
        catch (_) { return {...DEFAULTS}; }
    }
    let appearance = readAppearance();
    const color = (value, fallback) => /^#[a-f\d]{6}$/i.test(value) ? value : fallback;
    function luminance(hex) {
        const rgb = hex.slice(1).match(/../g).map(part=>parseInt(part,16)/255).map(n=>n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4);
        return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    }
    function contrast(a,b) { const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05); }
    function applyAppearance() {
        const theme = THEMES[appearance.theme] || (appearance.theme === 'custom' ? {
            accent:color(appearance.accent,DEFAULTS.accent), background:color(appearance.background,DEFAULTS.background), text:color(appearance.text,DEFAULTS.text), secondary:color(appearance.accent,DEFAULTS.accent)
        } : THEMES.mint);
        const style=document.documentElement.style;
        // Custom colors remain readable even when an imported preference has low contrast.
        const text = contrast(theme.text,theme.background)>=4.5 ? theme.text : (luminance(theme.background)>.18?'#111111':'#f5f8f7');
        const accent = contrast(theme.accent,theme.background)>=3 ? theme.accent : text;
        style.setProperty('--terminal-bg',theme.background);style.setProperty('--terminal-fg',text);
        style.setProperty('--accent-cyan',accent);style.setProperty('--accent-amber',contrast(theme.secondary,theme.background)>=3?theme.secondary:accent);
        style.setProperty('--app-font',FONTS[appearance.font] || FONTS.system);
        style.setProperty('--app-scale',Math.min(1.35,Math.max(.9,Number(appearance.scale)||1)));
        style.setProperty('--accent-dim',text);style.setProperty('--border-color',`color-mix(in srgb, ${text} 15%, transparent)`);
        document.body.classList.toggle('reduced-motion',Boolean(appearance.reducedMotion));
        document.documentElement.dataset.theme=appearance.theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.background);
        if(root.VikiNative?.setFullscreen) root.VikiNative.setFullscreen(Boolean(appearance.fullscreen));
        const status=$('appearanceStatus');
        if(status) status.textContent=appearance.theme==='custom' && (text!==theme.text||accent!==theme.accent)?'Theme saved. Low-contrast colors were adjusted for readability.':'Saved on this device. Changes apply immediately.';
    }
    function saveAppearance() { localStorage.setItem(KEY,JSON.stringify(appearance));applyAppearance(); }
    function node(tag,cls,text) { const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e; }
    function inputRow(labelText,input) { const label=node('label','appearance-field');label.append(node('span','config-label',labelText),input);return label; }
    function buildAppearance() {
        const section=node('section','settings-section appearance-section');section.dataset.category='appearance';
        section.append(node('h2','config-title','Appearance & display'),node('p','config-help','A quieter cyberpunk interface, tuned to your screen. Appearance stays on this device.'));
        const themes=node('div','theme-options');themes.setAttribute('aria-label','Color theme');
        for(const [key,label] of [['mint','Neon mint'],['violet','Electric violet'],['amber','Amber terminal'],['custom','Custom']]) {
            const button=node('button','theme-option',label);button.type='button';button.dataset.theme=key;button.setAttribute('aria-pressed',String(appearance.theme===key));
            const swatch=node('span','theme-swatch');swatch.style.background=(THEMES[key]||{accent:appearance.accent}).accent;swatch.setAttribute('aria-hidden','true');button.prepend(swatch);
            button.onclick=()=>{appearance.theme=key;saveAppearance();updateThemeControls();};themes.append(button);
        }
        section.append(themes);
        const colors=node('div','custom-colors');colors.id='customThemeColors';
        for(const [key,label] of [['accent','Accent'],['background','Background'],['text','Text']]) {
            const input=node('input');input.type='color';input.id=`theme${key[0].toUpperCase()+key.slice(1)}`;input.value=color(appearance[key],DEFAULTS[key]);
            input.oninput=()=>{appearance[key]=input.value;appearance.theme='custom';saveAppearance();updateThemeControls();};colors.append(inputRow(label,input));
        }
        section.append(colors);
        const select=node('select','config-select');select.id='appearanceFont';
        for(const [key,label] of [['system','System • clean'],['mono','Terminal • monospace'],['readable','Readable • wide letters'],['serif','Book • serif']]) { const option=node('option','',label);option.value=key;select.append(option); }
        select.value=appearance.font;select.onchange=()=>{appearance.font=select.value;saveAppearance();};section.append(inputRow('Text font',select));
        const size=node('input','config-input');size.id='appearanceScale';size.type='range';size.min='.9';size.max='1.35';size.step='.05';size.value=String(appearance.scale);
        const sizeLabel=node('output','appearance-size-value',`${Math.round(appearance.scale*100)}%`);sizeLabel.htmlFor=size.id;
        size.oninput=()=>{appearance.scale=Number(size.value);sizeLabel.textContent=`${Math.round(appearance.scale*100)}%`;saveAppearance();};const sizeRow=inputRow('Text size',size);sizeRow.append(sizeLabel);section.append(sizeRow);
        for(const [key,label,help] of [['reducedMotion','Reduce motion','Disable decorative animation and transitions.'],['fullscreen','Fullscreen & auto-hide system bars',root.VikiNative?'Swipe from the screen edge to reveal Android system bars.':'On Android, status and navigation bars hide automatically. Browser fullscreen needs a tap.']]) {
            const row=node('label','appearance-toggle');const input=node('input');input.type='checkbox';input.id=key==='fullscreen'?'fullscreenEnabled':'reduceMotion';input.checked=Boolean(appearance[key]);
            input.onchange=()=>{appearance[key]=input.checked;saveAppearance();};const copy=node('span');copy.append(node('span','',label),node('small','',help));row.append(input,copy);section.append(row);
        }
        if(!root.VikiNative) {const fullscreen=node('button','config-button','Enter browser fullscreen');fullscreen.type='button';fullscreen.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(_){$('appearanceStatus').textContent='Fullscreen is not available in this browser.';}};section.append(fullscreen);}
        const preview=node('div','appearance-preview');preview.append(node('small','','VIKI / SYSTEM ONLINE'),node('strong','','Make room for everyday life.'),node('span','','Add milk, 2 bread, and eggs'));section.append(preview);
        const status=node('p','config-help');status.id='appearanceStatus';status.setAttribute('role','status');section.append(status);
        return section;
    }
    function updateThemeControls() {
        document.querySelectorAll('.theme-option').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.theme===appearance.theme)));
        $('customThemeColors').hidden=appearance.theme!=='custom';
    }
    function classify(section) {
        if(section.dataset.category)return section.dataset.category;
        if(section.querySelector('#localStorageStatus,#supabaseUrl,#exportDataButton,#storageMode'))return 'storage';
        if(section.querySelector('#localNotificationsEnabled,#emailNotificationsEnabled,#reminderEmailsEnabled'))return 'alerts';
        if(section.querySelector('#apiKey,#speechEnabled,#wakeWordEnabled,#customQuickCommand,#weatherLocation'))return 'assistant';
        return 'advanced';
    }
    function buildSettings() {
        const page=$('settingsPage'),grid=page.querySelector('.settings-grid');
        $('settingsHeading').textContent='Settings';page.querySelector('.settings-subtitle').textContent='Make VIKI work your way.';$('closeSettingsButton').textContent='← Back';
        grid.prepend(buildAppearance());
        const controls=node('div','settings-controls');const search=node('input','settings-search');search.type='search';search.id='settingsSearch';search.placeholder='Find a setting…';search.setAttribute('aria-label','Search settings');
        const tabs=node('nav','settings-categories');tabs.setAttribute('aria-label','Settings categories');
        const groups={};
        for(const [key,label] of [['appearance','Appearance'],['storage','Storage'],['alerts','Alerts'],['assistant','Assistant'],['advanced','Advanced']]) {
            const button=node('button','settings-category',label);button.type='button';button.dataset.category=key;button.setAttribute('aria-pressed',String(key===activeCategory));button.onclick=()=>{search.value='';selectSettingsCategory(key);};tabs.append(button);
            const group=node('div','settings-group');group.dataset.category=key;groups[key]=group;
        }
        const friendly = text => text.replace(/_/g,' ').toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase()).replace(/\bAi\b/g,'AI').replace(/\bApi\b/g,'API').replace(/\bApis\b/g,'APIs').replace(/\bEmailjs\b/g,'EmailJS').replace(/\bLlm\b/g,'LLM');
        grid.querySelectorAll('.config-label,.toggle-label').forEach(label=>{for(const child of label.childNodes)if(child.nodeType===Node.TEXT_NODE)child.textContent=friendly(child.textContent);});
        grid.querySelectorAll('.config-button').forEach(button=>{if(button.children.length===0)button.textContent=friendly(button.textContent);});
        const sections=[...grid.querySelectorAll('.settings-section')];
        sections.forEach(section=>{
            const category=classify(section);section.dataset.category=category;
            const title=section.querySelector('.config-title');if(title){title.textContent=friendly(title.textContent.replace(/^\/\/\s*/,''));}
            groups[category].append(section);
        });
        grid.replaceChildren(...Object.values(groups));
        const dataTools=$('exportDataButton').closest('.settings-section');groups.storage.prepend(dataTools);
        dataTools.querySelector('.config-title').textContent='Import & export';$('exportDataButton').textContent='Export JSON backup';$('importDataButton').textContent='Import JSON backup';
        const cloud=$('supabaseUrl').closest('.settings-section'),details=node('details','optional-cloud'),summary=node('summary','','Optional Supabase transfers');
        details.append(summary);const cloudTitle=cloud.querySelector('.config-title');const mode=$('storageMode').closest('.config-row'),modeHelp=$('storageModeHelp');
        details.append(mode,modeHelp);for(const child of [...cloud.childNodes])if(child!==cloudTitle)details.append(child);cloud.append(details);
        controls.append(search,tabs);page.querySelector('.settings-header').after(controls);
        const empty=node('p','settings-empty','No settings found. Try “voice”, “backup”, or “notification”.');empty.id='settingsSearchEmpty';empty.hidden=true;grid.after(empty);
        search.oninput=filterSettings;
        new MutationObserver(()=>{if(!page.hidden){paintView('settings');filterSettings();}else if(document.body.dataset.vikiView==='settings')paintView(previousView);}).observe(page,{attributes:true,attributeFilter:['hidden']});
        updateThemeControls();filterSettings();
    }
    function filterSettings() {
        const query=$('settingsSearch').value.trim().toLowerCase();let count=0;
        document.querySelectorAll('.settings-group').forEach(group=>{
            let matched=false;
            group.querySelectorAll('.settings-section').forEach(section=>{const visible=(!query&&group.dataset.category===activeCategory)||(query&&section.textContent.toLowerCase().includes(query));section.hidden=!visible;if(visible){count++;matched=true;}});
            group.hidden=!matched;
        });
        document.querySelectorAll('.settings-category').forEach(button=>button.setAttribute('aria-pressed',String(!query&&button.dataset.category===activeCategory)));
        if(query)document.querySelectorAll('.optional-cloud').forEach(details=>{if(details.textContent.toLowerCase().includes(query))details.open=true;});
        $('settingsSearchEmpty').hidden=count!==0;
    }
    function selectSettingsCategory(category) {
        if(!['appearance','storage','alerts','assistant','advanced'].includes(category))return;
        activeCategory=category;filterSettings();$('settingsPage').scrollTop=0;
        document.dispatchEvent(new CustomEvent('viki-settings-change',{detail:{category}}));
    }
    function paintView(view) {
        document.body.dataset.vikiView=view;
        document.querySelectorAll('.mobile-nav-button').forEach(button=>button.setAttribute('aria-current',button.dataset.view===view?'page':'false'));
        document.dispatchEvent(new CustomEvent('viki-view-change',{detail:{view}}));
    }
    function selectView(view) {
        if(!['chat','assets','reminders','settings'].includes(view))return;
        if(view==='settings') {if(document.body.dataset.vikiView!=='settings')previousView=document.body.dataset.vikiView||'chat';root.setSettingsOpen?.(true);}
        else {
            previousView=view;root.setSettingsOpen?.(false);
            if(view==='assets'||view==='reminders') {root.setRegistryView?.(view);$('registryTitleButton').textContent=view==='assets'?'Your inventory':'Reminders';}
        }
        paintView(view);
    }
    function buildNavigation() {
        const nav=node('nav','mobile-navigation');nav.id='mobileNavigation';nav.setAttribute('aria-label','Main navigation');
        const icons={chat:'◌',assets:'▦',reminders:'◷',settings:'⚙'};
        for(const [view,label] of [['chat','Chat'],['assets','Assets'],['reminders','Reminders'],['settings','Settings']]){
            const button=node('button','mobile-nav-button');button.type='button';button.dataset.view=view;const icon=node('span','mobile-nav-icon',icons[view]);icon.setAttribute('aria-hidden','true');button.append(icon,node('span','',label));button.onclick=()=>selectView(view);nav.append(button);
        }
        document.body.append(nav);
        $('vikiLogo').addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();selectView('chat');},true);
        $('registryTitleButton').addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();selectView(document.body.dataset.vikiView==='reminders'?'assets':'reminders');},true);
        $('openSettingsButton').addEventListener('click',()=>{previousView=document.body.dataset.vikiView||'chat';},true);
        const logo=$('vikiLogo');logo.removeAttribute('aria-controls');logo.removeAttribute('aria-expanded');logo.setAttribute('aria-label','VIKI home');logo.title='VIKI home';
        const caption=node('span','mobile-header-caption','Your everyday inventory');document.querySelector('.header-left').append(caption);
    }
    function upgradeLocations() {
        const source=document.querySelector('.filter-tabs');
        source.querySelectorAll('.filter-tab').forEach(tab=>{
            tab.setAttribute('role','button');tab.tabIndex=0;tab.setAttribute('aria-label',tab.dataset.filter==='all'?'All locations':`${tab.dataset.filter} items`);
            tab.textContent=({all:'All',fridge:'Fridge',freezer:'Freezer',cupboard:'Cupboard'})[tab.dataset.filter];
            tab.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();tab.click();}});
        });
        source.classList.add('location-chips');
        $('filterCollapseButton').before(source);$('filterCollapseButton').querySelector('span').textContent='Search & filters';
        $('inventorySearch').placeholder='Search your inventory';
        $('messageInput').placeholder='Add milk, 2 bread, and eggs…';
        document.querySelector('.send-btn').textContent='Send';
        document.querySelectorAll('.quick-cmd').forEach(button=>{button.textContent=button.textContent.charAt(0)+button.textContent.slice(1).toLowerCase();});
    }
    function init() {
        if(initialized)return;initialized=true;
        document.body.classList.add('viki-modern');
        const viewport=document.querySelector('meta[name="viewport"]');viewport?.setAttribute('content','width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content');
        buildSettings();buildNavigation();upgradeLocations();applyAppearance();
        const resize=()=>{document.documentElement.style.setProperty('--app-height',`${Math.round(root.visualViewport?.height||root.innerHeight)}px`);document.body.classList.toggle('keyboard-open',Boolean(root.VikiNative?.keyboardVisible?.() || (root.visualViewport&&root.innerHeight-root.visualViewport.height>130)));};
        root.addEventListener('viki-ime-change',resize);
        root.visualViewport?.addEventListener('resize',resize);root.addEventListener('resize',resize);resize();
        const settingsHeader=document.querySelector('.settings-header'),settingsControls=document.querySelector('.settings-controls');
        const topbar=node('div','settings-topbar');settingsHeader.before(topbar);topbar.append(settingsHeader,settingsControls);
        document.querySelectorAll('.mobile-nav-icon').forEach(icon=>{
            const view=icon.parentElement.dataset.view,paths={chat:'M4 4h16v12H9l-5 4V4',assets:'M4 8h16v12H4V8 M3 4h18v4H3z M9 12h6',reminders:'M12 3a6 6 0 0 0-6 6v5l-2 3h16l-2-3V9a6 6 0 0 0-6-6 M10 21h4',settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6'};
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','22');svg.setAttribute('height','22');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('stroke-linecap','round');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[view]);svg.append(path);icon.replaceChildren(svg);
        });
        selectView('chat');
        document.body.classList.add('mobile-ui-ready');
    }
    root.VikiMobile=Object.freeze({init,selectView,selectSettingsCategory,applyAppearance,appearance:()=>({...appearance})});
})(window);
