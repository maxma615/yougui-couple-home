export async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("未提供密码环境变量，且当前终端不支持安全交互输入");
  }
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: string | Buffer) => {
      const text = String(chunk);
      for (const character of text) {
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u0003") {
          cleanup();
          reject(new Error("已取消"));
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

export function option(name: string, args = process.argv.slice(2)): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

export function rejectPasswordArguments(args = process.argv.slice(2)): void {
  if (args.some((argument) => argument === "--password" || argument.startsWith("--password="))) {
    throw new Error("密码不能通过命令行参数传入，请使用安全环境变量或交互输入");
  }
}
