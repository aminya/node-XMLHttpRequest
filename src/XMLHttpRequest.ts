import http from 'http';
import {
  InvalidStateDOMException,
  SyntaxErrDOMException,
  SecurityErrDOMException,
} from './DOMException';
import * as Methods from './methods';
import { URL } from 'url';
import * as Headers from './headers';
import { spawnSync } from 'child_process';
import request, { Response, CoreOptions } from 'request';

const defaultHeaders = {
  'User-Agent': 'node-XMLHttpRequest',
  Accept: '*/*',
};

interface Settings {
  url: string;
  method: Methods.AllowedMethod;
  async: boolean;
  username: string | null;
  password: string | null;
}

export class XMLHttpRequest {
  private request: http.ClientRequest | undefined | null;

  private response: request.Response | undefined;

  private settings: Settings;

  private headers: Record<string, string>;

  private readonly headersCase: Record<string, string>;

  private sendFlag: boolean;

  private errorFlag: boolean;

  private _status: number;

  private _readyState: number;

  private _responseXML: Document | null;

  private _responseText: string;

  private _statusText: string;

  private _responseType: XMLHttpRequestResponseType;

  private _timeout: number;

  private readonly listeners: Record<string, Function[]>;

  public readonly UNSENT = 0;

  public readonly OPENED = 1;

  public readonly HEADERS_RECEIVED = 2;

  public readonly LOADING = 3;

  public readonly DONE = 4;

  public onreadystatechange: ((this: XMLHttpRequest, ev: Event) => any) | null;

  public withCredentials: boolean;

  constructor() {
    this.sendFlag = false;
    this.errorFlag = false;
    this._readyState = this.UNSENT;
    this.headers = {};
    this.headersCase = {};
    this.listeners = {};
    this.settings = {
      url: '',
      method: 'GET',
      async: true,
      username: null,
      password: null,
    };
    this._responseText = '';
    this._responseType = '';
    this._responseXML = null;
    this.onreadystatechange = null;
    this._status = 0;
    this._timeout = 0;
    this._statusText = '';
    this.withCredentials = false;
  }

  public get statusText(): string {
    return this._statusText;
  }

  public get responseXML(): Document | null {
    return this._responseXML;
  }

  public get responseText(): string {
    return this._responseText;
  }

  public get readyState(): number {
    return this._readyState;
  }

  public get status(): number {
    return this._status;
  }

  public get responseType(): XMLHttpRequestResponseType {
    return this._responseType;
  }

  public set responseType(type: XMLHttpRequestResponseType) {
    if (type === 'document') {
      return;
    }
    if (this._readyState === this.LOADING || this._readyState === this.DONE) {
      throw new InvalidStateDOMException(
        `the state is must not be loading or done`,
      );
    }
    this._responseType = type;
  }

  public get responseURL(): string {
    if (!this.response) {
      return '';
    }
    return this.response.url || '';
  }

  public get timeout(): number {
    return this._timeout;
  }

  public set timeout(t: number) {
    this._timeout = t;
  }

  public open(
    method: string,
    url: string,
    async = true,
    username: string | null = null,
    password: string | null = null,
  ): void {
    const normalizedMethod = Methods.normalize(method);
    if (!Methods.isValid(normalizedMethod)) {
      throw new SyntaxErrDOMException('method is not a valid method');
    }
    if (Methods.isForbidden(normalizedMethod)) {
      throw new SecurityErrDOMException('method is forbidden');
    }

    try {
      this.settings = {
        method: normalizedMethod,
        url: new URL(url).toString(),
        async,
        username: username,
        password: password,
      };
    } catch (err) {
      throw new SyntaxErrDOMException('invalid url');
    }

    this.abort();
    this.errorFlag = false;

    this.setState(this.OPENED);
  }

  public send(data?: Document | BodyInit | null) {
    if (this.readyState !== this.OPENED) {
      throw new InvalidStateDOMException('state is not opened');
    }
    if (this.sendFlag) {
      throw new InvalidStateDOMException(
        'cannot send when already in sending state',
      );
    }
    const { method, username, password } = this.settings;
    const body = method === 'GET' || method === 'HEAD' ? null : data;
    const url = new URL(this.settings.url);
    const requestParams: CoreOptions = {
      headers: this.headers,
      method,
      body,
      auth:
        username && password
          ? {
              username: username,
              password: password,
            }
          : undefined,
      followRedirect: true,
    };

    this.errorFlag = false;
    if (this.settings.async) {
      this.sendFlag = true;
      let responseText = '';
      request(url.toString(), requestParams)
        .on('data', (data) => {
          if (this.readyState === this.HEADERS_RECEIVED) {
            this._readyState = this.LOADING;
          }
          responseText += data;
          this.dispatchEvent('readystatechange');
        })
        .on('response', (resp) => {
          this.response = resp;
          this.setState(this.HEADERS_RECEIVED);
        })
        .on('complete', (resp) => {
          this._status = resp.statusCode;
          this._responseText = responseText;
          this.sendFlag = false;
          this.setState(this.DONE);
        })
        .on('error', (err) => {
          this._status = 0;
          this._statusText = '';
          this._responseText = err.message;
          this.errorFlag = true;
          this.sendFlag = false;
          this.setState(this.DONE);
          this.dispatchEvent('error');
        });

      this.dispatchEvent('loadstart');
    } else {
      const result = spawnSync(process.execPath, [
        require.resolve('./worker'),
        url.toString(),
        JSON.stringify(requestParams),
      ]);
      if (result.status === 0) {
        const resp: Response = JSON.parse(result.stdout.toString().trim());
        this.response = resp;
        this._status = resp.statusCode;
        this._responseText = resp.body;
        this.setState(this.DONE);
      } else {
        this._status = 0;
        this._statusText = '';
        this._responseText = result.stderr.toString();
        this.errorFlag = true;
        this.setState(this.DONE);
        this.dispatchEvent('error');
      }
    }
  }

  public getRequestHeader(name: string) {
    if (typeof name === 'string' && this.headersCase[name.toLowerCase()]) {
      return this.headers[this.headersCase[name.toLowerCase()]];
    }
    return '';
  }

  /**
   * Gets all the response headers.
   *
   * @return string A string with all response headers separated by CR+LF
   */
  public getAllResponseHeaders() {
    if (this.readyState < this.HEADERS_RECEIVED || this.errorFlag) {
      return '';
    }
    let result = '';
    const headers = this.response ? this.response.headers : {};
    for (const i in headers) {
      // Cookie headers are excluded
      if (i !== 'set-cookie' && i !== 'set-cookie2') {
        result += i + ': ' + headers[i] + '\r\n';
      }
    }
    return result.substr(0, result.length - 2);
  }

  public getResponseHeader(header: string) {
    if (
      typeof header === 'string' &&
      this.readyState > this.OPENED &&
      this.response &&
      this.response.headers &&
      this.response.headers[header.toLowerCase()] &&
      !this.errorFlag
    ) {
      return this.response.headers[header.toLowerCase()];
    }
    return null;
  }

  public handleError(error): void {
    this._status = 0;
    this._statusText = error;
    this._responseText = error.stack;
    this.errorFlag = true;
    this.setState(this.DONE);
    this.dispatchEvent('error');
  }

  public abort(): void {
    if (this.request) {
      this.request.abort();
      this.request = null;
    }
    this.headers = defaultHeaders;
    this._status = 0;
    this._responseText = '';
    this._responseXML = null;
    this.errorFlag = true;
    if (
      this.readyState !== this.UNSENT &&
      (this.readyState !== this.OPENED || this.sendFlag) &&
      this.readyState !== this.DONE
    ) {
      this.sendFlag = false;
      this.setState(this.DONE);
    }
    this._readyState = this.UNSENT;
    this.dispatchEvent('abort');
  }

  public addEventListener(event: string, callback: Function): void {
    if (!(event in this.listeners)) {
      this.listeners[event] = [];
    }
    // Currently allows duplicate callbacks. Should it?
    this.listeners[event].push(callback);
  }

  public removeEventListener(event: string, callback: Function): void {
    if (event in this.listeners) {
      // Filter will return a new array with the callback removed
      this.listeners[event] = this.listeners[event].filter(function(ev) {
        return ev !== callback;
      });
    }
  }

  public dispatchEvent(event: string): void {
    if (typeof this['on' + event] === 'function') {
      this['on' + event]();
    }
    if (event in this.listeners) {
      for (let i = 0, len = this.listeners[event].length; i < len; i++) {
        this.listeners[event][i].call(this);
      }
    }
  }

  public setRequestHeader(header: string, value: string): void {
    if (this.readyState !== this.OPENED) {
      throw new InvalidStateDOMException('state is not opened');
    }

    if (this.sendFlag) {
      throw new Error('INVALID_STATE_ERR: send flag is true');
    }
    if (!this.disableHeaderCheck && Headers.isForbidden(header)) {
      console.warn(`Refused to set unsafe header "${header}"`);
      return;
    }
    header = this.headersCase[header.toLowerCase()] || header;
    this.headersCase[header.toLowerCase()] = header;
    this.headers[header] = this.headers[header]
      ? this.headers[header] + ', ' + value
      : value;
  }

  private disableHeaderCheck: boolean = false
  /**
   * Disables or enables `Headers.isForbidden(header)` check in the `setRequestHeader`.
   * The check is done by default (passing `false`).
   * If you pass `true`, then it no longer conforms to the W3C spec.
   *
   * @param {boolean} state enable or disable header checking.
   */
  public setDisableHeaderCheck(state: boolean = false) {
    this.disableHeaderCheck = state;
  }

  private setState(state: number): void {
    if (state == this.LOADING || this.readyState !== state) {
      this._readyState = state;
      if (
        this.settings.async ||
        this.readyState < this.OPENED ||
        this.readyState === this.DONE
      ) {
        this.dispatchEvent('readystatechange');
      }
      if (this.readyState === this.DONE && !this.errorFlag) {
        this.dispatchEvent('load');
        // @TODO figure out InspectorInstrumentation::didLoadXHR(cookie)
        this.dispatchEvent('loadend');
      }
    }
  }
}
