import osjs from 'osjs';
import {EventEmitter} from '@osjs/event-emitter';
import {name as applicationName} from './metadata.json';
import {Terminal} from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';
import * as argv from 'argv-parse';
import * as commands from './commands.js';

Terminal.applyAddon(fit);

class Shell extends EventEmitter {

  constructor(core) {
    super('Shell');

    this.core = core;
    this.xterm = new Terminal();
    this.cwd = '/';
    this.input = '';
    this.history = [];
  }

  init($root) {
    this.xterm.addDisposableListener('key', (...args) => {
      this.emit('key', ...args);

      this.onKeyDown(...args);
    });

    this.xterm.addDisposableListener('paste', data => {
      this.xterm.write(data);
    });

    this.xterm.open($root);
    this.exec('banner');
    //this.prompt();
  }

  exec(input) {
    this.history.push(input);

    const done = (err) => {
      this.xterm.writeln('');

      if (err) {
        console.warn(err);
        try {
          this.xterm.writeln(JSON.stringify(err));
        } catch (e) {
          this.xterm.writeln(err);
        }
      }

      setTimeout(() => this.prompt(), 10);
    };

    this.xterm.writeln('');

    return this._exec(input)
      .then(result => done(null, result))
      .catch(done);
  }

  _exec(input) {
    const [cmd, ...args] = input.split(' ');
    const context = this._context(input);

    context.on('data', s => this.xterm.write(s));

    if (commands[cmd]) {
      const a = argv({}, args);
      try {
        const result = commands[cmd](context, this.core, this.xterm)(a, input);
        if (result instanceof Promise) {
          return result;
        }

        return new Promise((resolve, reject) => {
          context.on('close', () => resolve());
          context.on('error', err => reject(err));
        });
      } catch (e) {
        return Promise.reject(e);
      }
    }

    return Promise.reject(new Error(`Command not found: ${input}`));
  }

  _context(input) {
    const ctx = new EventEmitter(input);

    return {
      input,
      cwd: this.cwd,
      on: (...args) => ctx.on(...args),
      emit: (...args) => ctx.emit(...args),
      close: (err) => err ? ctx.emit('error', err) : ctx.emit('close'),
      write: (...args) => this.xterm.write(...args),
      writeln: (...args) => this.xterm.writeln(...args),
      clear: () => this.xterm.clear()
    };
  }

  prompt() {
    const user = this.core.make('osjs/auth').user();
    const version = this.core.config('version') || 'latest';

    this.xterm.writeln('');
    this.xterm.write(`[48;5;61m${user.username}@osjs-${version}:${this.cwd} > [0m `);
  }

  fit() {
    this.xterm.fit();
  }

  onKeyDown(key, ev) {
    const printable = !ev.altKey && !ev.altGraphKey && !ev.ctrlKey && !ev.metaKey;

    if (ev.keyCode === 13) {
      if (this.input.length > 0) {
        this.exec(this.input);
      } else {
        this.prompt();
      }

      this.input = '';
    } else if (ev.keyCode === 8) {
      if (this.input.length > 0) {
        this.xterm.write('\b \b');
        this.input = this.input.substring(0, this.input.length - 1);
      }
    } else if ([37, 38, 39, 40].indexOf(ev.keyCode) !== -1) {
      // TODO
    } else if (printable) {
      this.input += key;

      this.xterm.write(key);
    }
  }
}

const register = (core, args, options, metadata) => {
  const proc = core.make('osjs/application', {args, options, metadata});

  proc.createWindow({
    id: 'TerminalWindow',
    title: metadata.title.en_EN,
    dimension: {width: 800, height: 700}
  })
    .on('destroy', () => proc.destroy())
    .render(($content, win) => {
      const shell = new Shell(core);
      const fit = () => setTimeout(() => shell.fit(), 10);

      win.on('resized', fit);
      win.on('maximize', fit);
      win.on('restore', fit);
      win.on('render', fit);

      shell.init($content);
    });

  return proc;
};

osjs.register(applicationName, register);
