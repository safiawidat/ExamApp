const NavigationMenu = ({ user, onLogout }) => {
  return (
    <nav className="navbar navbar-dark bg-dark mb-4 shadow">
      <div className="container">
        <span className="navbar-brand mb-0 h1">E-Test System</span>

        {user && (
          <div className="d-flex align-items-center">
            <span className="text-white-50 me-3">
              Signed in as <strong>{user.username}</strong> ({user.role})
            </span>

            <button className="btn btn-outline-light btn-sm" onClick={onLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}

export default NavigationMenu
