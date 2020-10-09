

import java.io.IOException;


import java.sql.*;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
/**
 * Servlet implementation class Register
 */
public class Register extends HttpServlet {
	private static final long serialVersionUID = 1L;
       
    /**
     * @see HttpServlet#HttpServlet()
     */
    public Register() {
        super();
        // TODO Auto-generated constructor stub
    }

	/**
	 * @see HttpServlet#doGet(HttpServletRequest request, HttpServletResponse response)
	 */
	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		response.getWriter().append("Served at: ").append(request.getContextPath());
	}

	/**
	 * @see HttpServlet#doPost(HttpServletRequest request, HttpServletResponse response)
	 */
	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		// TODO Auto-generated method stub
		try {
			String username1 = request.getParameter("uname");
			String name = request.getParameter("name");
			String password1 = request.getParameter("password");
			String password2 = request.getParameter("password1");
			String utype = request.getParameter("utype");
			int age = Integer.parseInt(request.getParameter("age"));
			String email = request.getParameter("email");
			String gender = request.getParameter("gender");
			if(password1.equals(password2)) {
				Class.forName("com.mysql.jdbc.Driver");
				Connection conn = DriverManager.getConnection("jdbc:mysql://127.0.0.1/rachel1", "rachel", "rachel");
				PreparedStatement st = conn.prepareStatement("insert into mastertable(name,age,gender,emailaddress,usertype,username,password)"+ "values(?, ?, ?, ?, ?, ?, ?)"); 
				st.setString(1, name);
				st.setInt(2, age);
				st.setString(3,gender);
				st.setString(4,email);
				st.setString(5, utype);
				st.setString(6, username1);
				st.setString(7, password1);
				st.executeUpdate();
				st.close();
				conn.close();
				response.sendRedirect("login.jsp");
			}
			else {
				System.out.print("Retype password");
			}
		}
		catch(Exception e){
			e.printStackTrace();
		}
	}

}
