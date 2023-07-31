#! /usr/bin/env node
import { cli } from '../dist/cli.js';

cli({ cwd: process.cwd(), args: process.argv });
