import { formatSessionTime } from './time.js';
/** @param {string} value */
function escape(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/[,;]/g, (char) => `\\${char}`);
}
/** @param {{id:string,start_time:string,end_time:string,call_mode:string}} booking */
export function calendarEvent(booking) {
  const utc = (/** @type {string} */ value) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Conversation Studio//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${escape(booking.id)}@conversation-booking`,
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(booking.start_time)}`,
    `DTEND:${utc(booking.end_time)}`,
    `SUMMARY:${escape(`${booking.call_mode === 'video' ? 'Video' : 'Browser audio'} conversation`)}`,
    `DESCRIPTION:${escape(`${formatSessionTime(booking.start_time)}. Join through your private booking page.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
