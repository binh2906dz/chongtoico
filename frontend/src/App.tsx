import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Admin from "./pages/admin/Admin";
import AlbumView from "./pages/AlbumView";
import Albums from "./pages/Albums";
import { Login, Register } from "./pages/AuthPages";
import CategoryPage from "./pages/CategoryPage";
import Chat from "./pages/Chat";
import Following from "./pages/Following";
import Forum from "./pages/Forum";
import Home from "./pages/Home";
import Member from "./pages/Member";
import NewThread from "./pages/NewThread";
import Notifications from "./pages/Notifications";
import SavedVideos from "./pages/SavedVideos";
import Search from "./pages/Search";
import { Contact, NotFound, Privacy, Rules, Takedown, Terms } from "./pages/StaticPages";
import ThreadPage, { PostRedirect } from "./pages/ThreadPage";
import VideoHistory from "./pages/VideoHistory";
import VideoPage from "./pages/VideoPage";
import Videos, { VideoTags } from "./pages/Videos";
import WhatsNew from "./pages/WhatsNew";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="video" element={<Videos />} />
        <Route path="video/da-xem" element={<VideoHistory />} />
        <Route path="video/yeu-thich" element={<SavedVideos />} />
        <Route path="video/tag" element={<VideoTags />} />
        <Route path="video/tag/:tag" element={<Videos />} />
        <Route path="video/the-loai/:slug" element={<Videos />} />
        <Route path="video/:id" element={<VideoPage />} />
        <Route path="dang-theo-doi" element={<Following />} />
        <Route path="thong-bao" element={<Notifications />} />
        <Route path="dien-dan" element={<Forum />} />
        <Route path="dien-dan/:slug" element={<CategoryPage />} />
        <Route path="chu-de/:id" element={<ThreadPage />} />
        <Route path="bai/:id" element={<PostRedirect />} />
        <Route path="tao-chu-de" element={<NewThread />} />
        <Route path="moi" element={<WhatsNew />} />
        <Route path="album" element={<Albums />} />
        <Route path="album/:id" element={<AlbumView />} />
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
