import './homepage.css'
import { Link } from 'react-router-dom'

const Homepage = () => {

  
  return (
    <div className='homepage'>
      <div className='mainClass'>
        <h1>SU AI</h1>
        <h2>This is a chatbot designed for Sabanci University students</h2>
        <Link to="/dashboard">Get Started</Link>
      </div>
    </div>
  )
}

export default Homepage