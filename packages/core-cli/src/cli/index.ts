import { Command } from "commander";
import { initCommand } from "../commands/init.js";

const program = new Command();

program.name("core").description("Core CLI - A Command-Line Interface for Core").version("0.1.0");

program.command("init").description("Initialize Core development environment").action(initCommand);

program.parse(process.argv);
