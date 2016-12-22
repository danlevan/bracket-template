import * as yaml from 'js-yaml';
import * as path from 'path';
import LayoutHelper from './LayoutHelper';
import LayoutDependency from './LayoutDependency';
import TemplateStore from './TemplateStore';

// map for caching dependency files (raw file)
const layoutStore = new TemplateStore();
const layoutHelper = new LayoutHelper({
  store: layoutStore,
});

// default helpers
const helpers = {
  partial: (...args) => layoutHelper.partial(...args),
};

class LayoutTemplate {
  constructor(opts = {
    conf: {},
    tmpl: '',
  }) {
    // TODO: assert opts.conf
    this.conf = opts.conf;

    const { header, deps, tmpl } = parseTemplate(this.conf, opts.tmpl);
    this.header = header;
    this.tmpl = tmpl;
    this.deps = deps;

    // add helper data (partials, variables from child)
    this.conf.helpers = Object.assign(
      {},
      helpers,
      opts.conf.helpers,
    );
  }

  compile(header = {}) {
    if (this.deps.hasCircular()) {
      throw new Error('Has circular dependencies');
    }

    if (!this.deps.hasMaster()) {
      // header support
      let layout = '';
      Object
        .keys(header)
        .filter(key => key !== 'master')
        .forEach((key) => {
          layout += `${this.conf.keys.layout}.${key}=${JSON.stringify(header[key])};`;
        });
      layout = layout ? `[[ var ${this.conf.keys.layout}={};${layout} ]]` : '';

      return `${layout} ${this.tmpl}`;
    }

    const masterLayoutTemplate = new LayoutTemplate({
      conf: this.conf,
      tmpl: layoutStore.get(this.deps.master.path),
    });

    const newHeader = Object.assign(
      {},
      this.header,
      header,
    );

    return `${this.tmpl} ${masterLayoutTemplate.compile(newHeader)}`;
  }

  toString() {
    return `LayoutTemplate:
  master: ${this.deps.master ? this.deps.master.path : 'none'}
  partials: ${this.deps.partials.map(d => d.path)}
    `;
  }
}

/**
 * Parses the template looking for file dependencies (but doesn't load the dependency files).
 * @param {object} conf - The configuration
 * @param {string} tmpl - The template string to parse
 */
function parseTemplate(conf, tmpl) {
  // header
  let header = {};
  let cleanTmpl = tmpl.replace(conf.header, (m, headerStr) => {
    header = yaml.safeLoad(headerStr);
    return '';
  });

  // dependencies
  const deps = new LayoutDependency();

  const masterPath = header[conf.keys.master];
  if (masterPath) {
    deps.master = {
      path: path.resolve(conf.path, header[conf.keys.master]),
    };
  }

  // replace partial call's relative path to full path
  cleanTmpl = cleanTmpl.replace(conf.partial, (m, partialPath) => {
    const fullPath = path.resolve(conf.path, partialPath);
    deps.partials.set(
      partialPath,
      {
        path: fullPath,
      },
    );
    return m.replace(partialPath, fullPath);
  });

  return {
    header,
    deps,
    tmpl: cleanTmpl,
  };
}

export default LayoutTemplate;
