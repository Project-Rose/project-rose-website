import { Application, Router } from "@oak/oak";
import { bold, brightBlue } from "@std/fmt/colors";
import config from './config/config.json' with { type: 'json' }

const router = new Router();
const port = config.http.port

// root/index path and page
router.get("/", async (ctx) => {
  await ctx.send({ path: "/index.html" , root: "./views"});
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

// static public folder
app.use(async (ctx, next) => {
  try {
    await ctx.send({ root: "./public/" });
  } catch {
    await next();
  }
});

// 404 Not Found page
app.use(async (ctx) => {
  await ctx.send({ path: "/errors/404.html" , root: "./views"});
});

app.listen({ port });
app.addEventListener("listen", ({ port }) => {
  console.log(bold(brightBlue(`The Project Rosé website is running on port ${port}`)));
});