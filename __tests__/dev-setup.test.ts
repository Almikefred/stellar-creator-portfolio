import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Local Dev Infrastructure (#1631)', () => {
  const rootDir = process.cwd();
  const makefilePath = path.join(rootDir, 'Makefile');
  const dockerfilePath = path.join(rootDir, 'backend', 'Dockerfile.api');
  const rootComposePath = path.join(rootDir, 'docker-compose.yml');

  it('Makefile defines required dev targets in .PHONY', () => {
    expect(fs.existsSync(makefilePath)).toBe(true);
    const content = fs.readFileSync(makefilePath, 'utf-8');

    const expectedTargets = ['dev', 'dev-deps', 'dev-down', 'dev-status', 'dev-logs'];
    for (const target of expectedTargets) {
      expect(content).toContain(`${target}:`);
    }

    const firstLine = content.split('\n')[0];
    expect(firstLine).toContain('.PHONY:');
    for (const target of expectedTargets) {
      expect(firstLine).toContain(target);
    }
  });

  it('Makefile recipes use tabs instead of spaces', () => {
    const lines = fs.readFileSync(makefilePath, 'utf-8').split('\n');
    let inRecipe = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0 || line.startsWith('#')) continue;

      if (line.includes(':') && !line.startsWith('\t') && !line.startsWith(' ')) {
        inRecipe = true;
        continue;
      }

      if (inRecipe && line.startsWith('    ')) {
        throw new Error(`Invalid Makefile indentation on line ${i + 1}: space indentation found`);
      }
    }
  });

  it('Dockerfile.api exists and specifies cargo run for stellar-api', () => {
    expect(fs.existsSync(dockerfilePath)).toBe(true);
    const content = fs.readFileSync(dockerfilePath, 'utf-8');

    expect(content).toContain('FROM rust:');
    expect(content).toContain('EXPOSE 3001');
    expect(content).toContain('stellar-api');
  });

  it('root docker-compose.yml references backend/docker-compose.yml', () => {
    expect(fs.existsSync(rootComposePath)).toBe(true);
    const content = fs.readFileSync(rootComposePath, 'utf-8');

    expect(content).toContain('backend/docker-compose.yml');
  });
});
