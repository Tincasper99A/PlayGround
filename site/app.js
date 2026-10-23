const scenes = {
  'slow-burn': {
    label: 'Slow burn',
    titles: ['The Space Between Seconds', 'Almost, Almost', 'A Little Longer'],
    templates: [
      ({ names, setting }) => `${setting.charAt(0).toUpperCase() + setting.slice(1)}. The air is warm and close, and ${names} have stopped pretending there is anywhere else to be. A glance holds a beat too long, then another. “We should go,” one of you says. Nobody moves. The space between you tightens, impossible to ignore.`,
      ({ names, setting }) => `The ${setting.replace(/^(a|an) /, '')} feels smaller tonight. ${names} trade a look across the room, and the whole evening quietly rearranges itself around it. A hand brushes a wrist. Neither of you pulls away. “Tell me this isn’t just me,” one of you whispers. The answer is already written in the way you lean in.`,
      ({ names, setting }) => `Neither of you planned to stay this late. ${setting.charAt(0).toUpperCase() + setting.slice(1)}, two half-finished drinks, and a conversation that keeps circling back to the same charged pause. ${names} laugh at nothing. Then the laughter fades, and the silence does all the talking. Somewhere outside, the city keeps moving. In here, time doesn’t.`
    ]
  },
  'after-hours': {
    label: 'After hours',
    titles: ['The Last Light in the Office', 'One More Drink', 'After the Meeting'],
    templates: [
      ({ names, setting }) => `The office lights click off one row at a time. In the ${setting.replace(/^(a|an) /, '')}, ${names} are the last two left, sleeves rolled up and voices pitched low. A shared cab becomes a shared drink becomes a reason to stand a little closer. “One more?” The answer is already in the way you both lean in.`,
      ({ names, setting }) => `${setting.charAt(0).toUpperCase() + setting.slice(1)}. The crowd has thinned to almost nobody, and ${names} have found the quiet corner everyone else forgot. A secret, a laugh, a hand resting a second too long at the small of a back. “We’re going to regret this tomorrow,” one of you says. “Tomorrow,” the other answers, “is a problem for tomorrow.”`,
      ({ names, setting }) => `The last meeting ran long. The last train is already gone. ${setting.charAt(0).toUpperCase() + setting.slice(1)}, and ${names} are inventing reasons not to say goodnight. A jacket is offered. A shoulder stays warm. The streetlights turn everything soft, and the short walk home keeps taking the long way.`
    ]
  },
  rooftop: {
    label: 'City lights',
    titles: ['Rooftop, 2:14 A.M.', 'The City Below', 'Higher Ground'],
    templates: [
      ({ names, setting }) => `The city hums below the ${setting.replace(/^(a|an) /, '')}. ${names} pass a drink back and forth and trade truths that sound like dares. The wind lifts a jacket, a hand steadies a shoulder, and suddenly the night feels like it belongs to the two of you. “Tell me something you’ve never told anyone.” The city waits.`,
      ({ names, setting }) => `From up here, ${setting.replace(/^(a|an) /, '')} looks like a secret the rest of the world hasn’t found yet. ${names} sit shoulder to shoulder, close enough that every accidental touch feels deliberate. A plane crosses the sky. Neither of you looks away from each other. “Stay a little longer,” one of you says. The night agrees.`,
      ({ names, setting }) => `The elevator opens onto ${setting.replace(/^(a|an) /, '')}, and the noise of the city falls away. ${names} have the whole skyline and one unfinished bottle between them. A slow smile. A shared coat. The kind of quiet that makes a person brave. “I’ve been thinking about this all night,” one of you admits. The other steps closer.`
    ]
  },
  weekend: {
    label: 'Runaway weekend',
    titles: ['One Key, Two Names', 'No Questions Until Monday', 'The Borrowed House'],
    templates: [
      ({ names, setting }) => `Somewhere in the ${setting.replace(/^(a|an) /, '')}, the weekend loosens its tie. ${names} have one rule: no questions about Monday. A shared key, a slow smile, a hallway that takes too long to walk. “Your room or mine?” The question lands soft. The answer is a hand finding a hand.`,
      ({ names, setting }) => `${setting.charAt(0).toUpperCase() + setting.slice(1)}. The bags are still by the door. ${names} have nowhere to be and no one to answer to, and the afternoon stretches out like an invitation. A record spins. A drink sweats on the table. One of you reaches for the other’s hand, and the weekend officially begins.`,
      ({ names, setting }) => `The plan was simple: two friends, ${setting.replace(/^(a|an) /, '')}, a few days away from real life. The plan did not account for the way ${names} look at each other when the sun goes down. A borrowed key turns in the lock. A door closes. The rest of the world can wait until Monday.`
    ]
  }
};

const form = document.querySelector('#generator-form');
const namesInput = document.querySelector('#names');
const settingSelect = document.querySelector('#setting');
const title = document.querySelector('#scene-title');
const output = document.querySelector('#scene-output');
const vibeLabel = document.querySelector('#output-vibe');
const tensionValue = document.querySelector('#tension-value');
const tensionBar = document.querySelector('#tension-bar');
const panel = document.querySelector('.output-panel');
const toast = document.querySelector('#toast');
const copyButton = document.querySelector('#copy-button');
const rerollButton = document.querySelector('#reroll-button');
let toastTimer;
let currentText = '';

const pick = list => list[Math.floor(Math.random() * list.length)];

function renderScene() {
  const vibeKey = new FormData(form).get('vibe') || 'slow-burn';
  const vibe = scenes[vibeKey] || scenes['slow-burn'];
  const names = namesInput.value.trim() || 'Alex & Jordan';
  const setting = settingSelect.value;
  const text = pick(vibe.templates)({ names, setting });
  const tension = Math.floor(62 + Math.random() * 35);

  title.textContent = pick(vibe.titles);
  output.textContent = text;
  vibeLabel.textContent = vibe.label;
  tensionValue.textContent = `${tension}%`;
  tensionBar.style.width = `${tension}%`;
  currentText = `${title.textContent}\n\n${text}`;

  panel.classList.remove('refreshing');
  void panel.offsetWidth;
  panel.classList.add('refreshing');
  window.setTimeout(() => panel.classList.remove('refreshing'), 650);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
}

async function copyScene() {
  const original = copyButton.lastChild.textContent;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(currentText);
    } else {
      const area = document.createElement('textarea');
      area.value = currentText;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    copyButton.lastChild.textContent = ' Copied';
    window.setTimeout(() => { copyButton.lastChild.textContent = original; }, 1600);
    showToast('Scene copied to clipboard');
  } catch {
    showToast('Select the scene text to copy it');
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  renderScene();
});

rerollButton.addEventListener('click', renderScene);
copyButton.addEventListener('click', copyScene);

document.querySelectorAll('input[name="vibe"]').forEach(input => {
  input.addEventListener('change', () => {
    const vibe = scenes[input.value];
    if (vibe) vibeLabel.textContent = vibe.label;
  });
});

currentText = `${title.textContent}\n\n${output.textContent}`;
tensionBar.style.width = '84%';
