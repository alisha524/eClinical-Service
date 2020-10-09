
import java.io.IOException;
import java.sql.*;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;


public class LoginCheck extends HttpServlet {
	private static final long serialVersionUID = 1L;

	/**
	 * @see HttpServlet#HttpServlet()
	 */
	public LoginCheck() {
		super();
	}

	/**
	 * @see HttpServlet#doGet(HttpServletRequest request, HttpServletResponse
	 *      response)
	 */
	protected void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		response.getWriter().append("Served at: ").append(request.getContextPath());
	}

	/**
	 * @see HttpServlet#doPost(HttpServletRequest request, HttpServletResponse
	 *      response)
	 */
	protected void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		try {
			String username = request.getParameter("uname");
			String password = request.getParameter("password");
			Class.forName("com.mysql.jdbc.Driver"); // MySQL database connection
			Connection conn = DriverManager
					.getConnection("jdbc:mysql://127.0.0.1/rachel1", "rachel", "rachel");
			PreparedStatement pst = conn.prepareStatement("Select usertype,username, password from mastertable where username=? and password=?");
			pst.setString(1, username);
			pst.setString(2, password);
			ResultSet rs = pst.executeQuery();
			if (rs.next()) {
				user loggedinUser =  new user();
				loggedinUser.setUsername(username);
				loggedinUser.setUserType(rs.getString("usertype"));
				HttpSession session = request.getSession(); 
				session.setAttribute("user_details", loggedinUser);
				if(loggedinUser.getUserType().equals("patient")) {
					response.sendRedirect("patient.jsp");
				}
				else if(loggedinUser.getUserType().equals("admin")) {
					response.sendRedirect("admin.jsp");
				}
				else {
					response.sendRedirect("doctor.jsp");
				}
			}
			else {
				response.sendRedirect("login.page");
			}
			// out.println("Invalid login credentials");
		} catch (Exception e) {
			e.printStackTrace();
		}

	}

}
