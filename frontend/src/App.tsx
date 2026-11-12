import { lazy as reactLazy, type ComponentType } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Articles, { ArticleTags } from "./pages/Articles";

/** After a deploy, an open tab may ask for chunk files that no longer exist; reload once to get the new build. */
function lazy<T extends ComponentType>(loader: () => Promise<{ default: T }>) {
  return reactLazy(() =>
    loader().catch((err) => {
      const last = Number(sessionStorage.getItem("chunk-reload") || 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem("chunk-reload", String(Date.now()));
        location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }),
  );
}

const Admin = lazy(() => import("./pages/admin/Admin"));
const ArticleHistory = lazy(() => import("./pages/ArticleHistory"));
const ArticlePage = lazy(() => import("./pages/ArticlePage"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const Chat = lazy(() => import("./pages/Chat"));
const Following = lazy(() => import("./pages/Following"));
const Forum = lazy(() => import("./pages/Forum"));
const Member = lazy(() => import("./pages/Member"));
const NewThread = lazy(() => import("./pages/NewThread"));
const Notifications = lazy(() => import("./pages/Notifications"));
const SavedArticles = lazy(() => import("./pages/SavedArticles"));
const Search = lazy(() => import("./pages/Search"));
const ThreadPage = lazy(() => import("./pages/ThreadPage"));
const WhatsNew = lazy(() => import("./pages/WhatsNew"));
const PostRedirect = lazy(() => import("./pages/ThreadPage").then((m) => ({ default: m.PostRedirect })));
const Login = lazy(() => import("./pages/AuthPages").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("./pages/AuthPages").then((m) => ({ default: m.Register })));
const Rules = lazy(() => import("./pages/StaticPages").then((m) => ({ default: m.Rules })));
const Takedown = lazy(() => import("./pages/StaticPages").then((m) => ({ default: m.Takedown })));
const Terms = lazy(() => import("./pages/StaticPages").then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import("./pages/StaticPages").then((m) => ({ default: m.Privacy })));
const Contact = lazy(() => import("./pages/StaticPages").then((m) => ({ default: m.Contact })));
const NotFound = lazy(() => import("./pages/StaticPages").then((m) => ({ default: m.NotFound })));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="bai-viet" element={<Articles />} />
        <Route path="bai-viet/da-xem" element={<ArticleHistory />} />
        <Route path="bai-viet/yeu-thich" element={<SavedArticles />} />
        <Route path="bai-viet/tag" element={<ArticleTags />} />
        <Route path="bai-viet/tag/:tag" element={<Articles />} />
        <Route path="bai-viet/the-loai/:slug" element={<Articles />} />
        <Route path="bai-viet/:id" element={<ArticlePage />} />
        <Route path="dang-theo-doi" element={<Following />} />
        <Route path="thong-bao" element={<Notifications />} />
        <Route path="dien-dan" element={<Forum />} />
        <Route path="dien-dan/:slug" element={<CategoryPage />} />
        <Route path="chu-de/:id" element={<ThreadPage />} />
        <Route path="bai/:id" element={<PostRedirect />} />
        <Route path="tao-chu-de" element={<NewThread />} />
        <Route path="moi" element={<WhatsNew />} />
        <Route path="chat" element={<Chat />} />
        <Route path="thanh-vien/:username" element={<Member />} />
        <Route path="tim-kiem" element={<Search />} />
        <Route path="dang-nhap" element={<Login />} />
        <Route path="dang-ky" element={<Register />} />
        <Route path="quan-tri" element={<Admin />} />
        <Route path="noi-quy" element={<Rules />} />
        <Route path="go-noi-dung" element={<Takedown />} />
        <Route path="dieu-khoan" element={<Terms />} />
        <Route path="quyen-rieng-tu" element={<Privacy />} />
        <Route path="lien-he" element={<Contact />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
