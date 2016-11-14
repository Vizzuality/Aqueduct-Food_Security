import React from 'react';
import { Link } from 'react-router';

// Components
import HeaderTools from './HeaderTools';

class Header extends React.Component {

  constructor(props) {
    super(props);

    this.state = {
      active: ''
    };

    // Set bindings
    this.onClickBtnAction = this.onClickBtnAction.bind(this);
    this.onCloseModal = this.onCloseModal.bind(this);
  }

  /**
   * UI EVENTS
   * - onClickBtnAction
  */
  onClickBtnAction(e) {
    const current = e.currentTarget.dataset.active;

    this.setState({
      active: (current !== this.state.active) ? current : ''
    });
  }

  /**
   * MODAL EVENTS
   * - onCloseModal
  */
  onCloseModal() {
    this.setState({
      active: ''
    });
  }

  render() {
    return (
      <header className="c-header">
        <nav>
          {/* LOGO */}
          <h1 className="c-header-logo">
            <Link to="/">Logo</Link>
          </h1>

          {/* RIGHT MENU */}
          <ul className="list">
            <li>
              <button data-active="tools" className={`c-header-button ${this.state.active === 'tools' && '-active'}`} onClick={this.onClickBtnAction}>
                <span>Tools</span>
              </button>
            </li>
            <li>
              <Link className="c-header-button" to="/how-to">How to</Link>
            </li>
            <li>
              <Link className="c-header-button" to="/resource-library">Resource Library</Link>
            </li>
            <li>
              <Link className="c-header-button" to="/about">About us</Link>
            </li>
            <li>
              <Link className="c-header-button" to="/get-involved">Get involved</Link>
            </li>
            <li>
              <Link className="c-header-button" to="/search">
                <svg className="c-icon"><use xlinkHref="#icon-search" /></svg>
              </Link>
            </li>
          </ul>
        </nav>

        <HeaderTools active={this.state.active === 'tools'} />
      </header>
    );
  }
}

export default Header;
