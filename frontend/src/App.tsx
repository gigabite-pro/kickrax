import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'
import Trending from './pages/Trending'
import Product from './pages/Product'
import { TrendingProvider } from './context/TrendingContext'

function App() {
  return (
    <TrendingProvider>
      <div className="noise-overlay" />
      <div className="grid-bg min-h-screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/trending" element={<Trending />} />
          <Route path="/product/:sku" element={<Product />} />
        </Routes>
      </div>
    </TrendingProvider>
  )
}

export default App

