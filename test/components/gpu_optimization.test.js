import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('GPU Compositor & Shader Optimization (Option 2 - Gold Standard)', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const scssPath = path.join(rootDir, 'src/scss/ClipboardItem.scss');
  const mainJsPath = path.join(rootDir, 'src/electron/main.js');
  const componentPath = path.join(rootDir, 'src/components/ClipboardItem.jsx');

  it('enforces 120 FPS compositor cap via Chromium switch in main.js', () => {
    const mainJs = fs.readFileSync(mainJsPath, 'utf-8');
    expect(mainJs).toContain("app.commandLine.appendSwitch('limit-fps', '120')");
  });

  it('eliminates backdrop-filter blur shaders from recurring clipboard card items', () => {
    const scss = fs.readFileSync(scssPath, 'utf-8');
    expect(scss).not.toMatch(/backdrop-filter:\s*blur/);
    expect(scss).toContain('backdrop-filter: none');
  });

  it('eliminates heavy Gaussian box-shadows from individual clipboard cards', () => {
    const scss = fs.readFileSync(scssPath, 'utf-8');
    // Ensure .clipboard-item has box-shadow: none
    expect(scss).toMatch(/\.clipboard-item\s*\{[^}]*box-shadow:\s*none;/s);
  });

  it('delegates theme type colors to CSS custom properties rather than JS MutationObservers', () => {
    const component = fs.readFileSync(componentPath, 'utf-8');
    expect(component).not.toContain('new MutationObserver');
    expect(component).not.toContain('addEventListener(\'themeChanged\'');
    expect(component).not.toContain('getComputedStyle');
  });
});
