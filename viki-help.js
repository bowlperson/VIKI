/* Daily, offline command reference. Examples fill the composer; nothing executes on tap. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.VikiHelp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const KEY = 'viki_help_last_day_v1';
    const commands = Object.freeze([
        {example:'add 2 milk in fridge',label:'Add stock',note:'Review the proposed entry, then reply CONFIRM.'},
        {example:'add milk, bread, and eggs',label:'Add a list',note:'Separate items with commas. Confirm the whole list together.'},
        {example:'add eggs from two days ago',label:'Backdate a purchase',note:'The shelf-life countdown starts from the stored date.'},
        {example:'used 2 eggs',label:'Use some stock',note:'VIKI shows the remaining quantity before confirmation.'},
        {example:'move bread to freezer',label:'Change location',note:'Locations are fridge, freezer, and cupboard.'},
        {example:'Add reminder',label:'Schedule a reminder',note:'Follow the questions. Reply LOCAL to skip email recipients.'},
        {example:'What is expiring',label:'Check shelf life',note:'List food approaching its shelf-life estimate.'},
        {example:'Full inventory',label:'Inventory report',note:'List your stock, quantities, locations, and timelines.'},
        {example:'List reminders',label:'Reminder report',note:'List scheduled reminder times. Times use Tucson, Arizona.'},
        {example:'remove eggs',label:'Remove all of an item',note:'Always review the spelling and reply CONFIRM or CANCEL.'},
        {example:'what is the time',label:'Device date and time',note:'Works offline using your device clock.'},
        {example:'Daily briefing',label:'Weather and headlines',note:'Optional internet feature; configure weather/news in Settings.'},
        {example:'analyze milk',label:'Powered shelf-life review',note:'Optional AI integration; changes still need confirmation.'},
        {example:'help',label:'Show this guide',note:'Works offline, including while a confirmation is pending.'}
    ]);
    function dayKey(now = Date.now()) {
        const date = new Date(now);
        return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    }
    function showGuide(now = Date.now()) {
        const document = root.document, chat = document?.getElementById('chatArea');
        if (!chat) return;
        document.getElementById('vikiCommandGuide')?.remove();
        const guide = document.createElement('article'); guide.id='vikiCommandGuide'; guide.className='message system command-guide';
        const heading=document.createElement('h2'); heading.textContent='Your daily field guide';
        const intro=document.createElement('p'); intro.textContent='Welcome, Operator. Use a short command, review the result, then CONFIRM or CANCEL. Quantity defaults to 1. Unknown foods ask for shelf-life days—no AI required.';
        guide.append(heading,intro);
        const extra=document.createElement('details'), summary=document.createElement('summary');summary.textContent='More commands & reports';extra.append(summary);
        commands.forEach((command,index)=>{
            const row=document.createElement('div');row.className='command-guide-row';
            const button=document.createElement('button');button.type='button';button.className='command-example';button.textContent=command.example;button.setAttribute('aria-label',`${command.label}: ${command.example}`);
            button.onclick=()=>{const input=document.getElementById('messageInput');if(input){input.value=command.example;input.focus();}root.VikiMobile?.selectView('chat');};
            const description=document.createElement('p');description.textContent=`${command.label} · ${command.note}`;row.append(button,description);
            (index<4?guide:extra).append(row);
        });
        guide.append(extra);chat.append(guide);
        try{root.localStorage?.setItem(KEY,dayKey(now));}catch{/* Reference remains available if preferences cannot be saved. */}
        return guide;
    }
    function maybeShowDaily(now = Date.now()) {
        let previous;
        try{previous=root.localStorage?.getItem(KEY);}catch{}
        if(previous!==dayKey(now))return showGuide(now);
    }
    function init(){maybeShowDaily();}
    return Object.freeze({commands,dayKey,showGuide,maybeShowDaily,init});
});
