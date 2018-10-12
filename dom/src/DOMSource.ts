import {MainDOMSource} from './MainDOMSource';
import {BodyDOMSource} from './BodyDOMSource';
import {DocumentDOMSource} from './DocumentDOMSource';
import {MockedDOMSource} from './mockDOMSource';
import {PreventDefaultOpt} from './fromEvent';

export interface EventsFnOptions {
  useCapture?: boolean;
  passive?: boolean;
  bubbles?: boolean;
  preventDefault?: PreventDefaultOpt;
}

export type DOMSource = MainDOMSource | BodyDOMSource | DocumentDOMSource; // | MockedDOMSource;
