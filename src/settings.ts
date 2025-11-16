type Settings = {
    channel: string;
    exclude: string[];
    maxMessages: number;
    messageTextColor: string;
}

function parseSettingsFromQuery(): Settings {
    const params = new URLSearchParams(window.location.search);

    return {
        channel: params.get('channel') || 'twitch',
        exclude: params.get('exclude')?.split(',').map(name => name.trim().toLowerCase()) || ['streamelements', 'streamlabs', 'nightbot', 'moobot', 'fossabot'],
        maxMessages: parseInt(params.get('maxMessages') || '100'),
        messageTextColor: params.get('messageTextColor') || '#fff'
    };
}

export const settings = parseSettingsFromQuery();