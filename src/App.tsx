import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'
import Trending from './pages/Trending'

function App() {
  return (
    <>
      <div className="noise-overlay" />
      <div className="grid-bg min-h-screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/trending" element={<Trending />} />
        </Routes>
      </div>
    </>
  )
}

export default App

