const NavigationMenu = ({ role, onLogout }) => {
  return (
    <nav className="navbar navbar-dark bg-dark mb-4 shadow">
      <div className="container">
        <span className="navbar-brand mb-0 h1">E-Test System</span>

        {role && (
          <div className="d-flex align-items-center">
            <span className="text-white-50 me-3">
              Viewing as:{' '}
              <strong>{role.charAt(0).toUpperCase() + role.slice(1)}</strong>
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